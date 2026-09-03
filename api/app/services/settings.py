from __future__ import annotations

import sqlite3
from typing import Any

from ..db import many, one, run
from ..errors import unavailable
from ..timeutil import now_iso

WRITABLE = (
    "cooling_period_pass_days",
    "cooling_period_fail_days",
    "max_attempts",
    "score_policy",
    "session_ttl_minutes",
    "recording_retention_days",
    "id_image_retention_days",
    "answer_retention_days",
    "result_visibility",
)


def resolve_settings(conn: sqlite3.Connection, role_id: int | None = None) -> dict[str, Any]:
    """
    Role-scoped row if one exists, else global.

    Raises 503 rather than falling back to defaults when no global row exists.
    docs/05 §8 — a requirements *miss* is a legitimate "not required" answer, but
    missing settings mean we cannot compute a cooling window at all, and guessing
    risks letting a candidate re-test inside a lockout.
    """
    if role_id is not None:
        scoped = one(conn, "SELECT * FROM tmext_ai_assessment_settings WHERE role_id = ?", (role_id,))
        if scoped:
            return scoped
    glob = one(conn, "SELECT * FROM tmext_ai_assessment_settings WHERE role_id IS NULL")
    if not glob:
        raise unavailable("SETTINGS_UNAVAILABLE", "Assessment settings are not configured")
    return glob


def list_settings(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    return many(
        conn,
        "SELECT * FROM tmext_ai_assessment_settings ORDER BY (role_id IS NOT NULL), role_id",
    )


def update_settings(
    conn: sqlite3.Connection, role_id: int | None, patch: dict[str, Any], updated_by: str
) -> dict[str, Any]:
    fields = [k for k in WRITABLE if k in patch]
    if not fields:
        return resolve_settings(conn, role_id)

    where = "role_id IS NULL" if role_id is None else "role_id = ?"
    assignments = ", ".join(f"{f} = ?" for f in fields)
    params: list[Any] = [patch[f] for f in fields] + [updated_by, now_iso()]
    if role_id is not None:
        params.append(role_id)

    cur = run(
        conn,
        f"UPDATE tmext_ai_assessment_settings SET {assignments}, updated_by = ?, updated_at = ? WHERE {where}",
        params,
    )

    if cur.rowcount == 0 and role_id is not None:
        base = resolve_settings(conn)
        merged = {**base, **{f: patch[f] for f in fields}}
        run(
            conn,
            """INSERT INTO tmext_ai_assessment_settings
                 (id, role_id, cooling_period_pass_days, cooling_period_fail_days, max_attempts,
                  score_policy, session_ttl_minutes, recording_retention_days,
                  id_image_retention_days, answer_retention_days, result_visibility,
                  updated_by, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                f"settings-role-{role_id}", role_id,
                merged["cooling_period_pass_days"], merged["cooling_period_fail_days"],
                merged["max_attempts"], merged["score_policy"], merged["session_ttl_minutes"],
                merged["recording_retention_days"], merged["id_image_retention_days"],
                merged["answer_retention_days"], merged["result_visibility"],
                updated_by, now_iso(),
            ),
        )
    return resolve_settings(conn, role_id)
