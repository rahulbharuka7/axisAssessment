from __future__ import annotations

import sqlite3
from typing import Any

from ..db import many, one, run, uuid
from ..errors import conflict, not_found
from ..timeutil import now_iso

PROGRAM_TYPES = ("lateral", "campus", "referral", "vendor", "job_portal")


def resolve_requirement(
    conn: sqlite3.Connection, role_id: int, program_type: str
) -> dict[str, Any] | None:
    """
    docs/05 §2.1 — most specific wins.

      1. exact (role_id, program_type)
      2. wildcard (role_id, program_type IS NULL)
      3. neither -> None, which the caller treats as NOT_APPLICABLE (invariant 3)

    Leaving this ambiguous is a live production bug: with both rows present, an
    arbitrary row order silently decides whether a candidate is assessed.
    """
    exact = one(
        conn,
        """SELECT * FROM tmext_ai_assessment_requirements
            WHERE role_id = ? AND program_type = ? AND is_deleted = 0""",
        (role_id, program_type),
    )
    if exact:
        return exact
    return one(
        conn,
        """SELECT * FROM tmext_ai_assessment_requirements
            WHERE role_id = ? AND program_type IS NULL AND is_deleted = 0""",
        (role_id,),
    )


def list_requirements(
    conn: sqlite3.Connection,
    role_id: int | None = None,
    program_type: str | None = None,
    required: bool | None = None,
) -> list[dict[str, Any]]:
    where = ["is_deleted = 0"]
    params: list[Any] = []
    if role_id is not None:
        where.append("role_id = ?")
        params.append(role_id)
    if program_type is not None:
        where.append("program_type = ?")
        params.append(program_type)
    if required is not None:
        where.append("required = ?")
        params.append(1 if required else 0)
    return many(
        conn,
        f"""SELECT * FROM tmext_ai_assessment_requirements
             WHERE {' AND '.join(where)}
             ORDER BY role_id, (program_type IS NULL), program_type""",
        params,
    )


def create_requirement(
    conn: sqlite3.Connection,
    role_id: int,
    role_name: str,
    program_type: str | None,
    required: bool,
    created_by: str,
) -> dict[str, Any]:
    if program_type is None:
        existing = one(
            conn,
            """SELECT id FROM tmext_ai_assessment_requirements
                WHERE role_id = ? AND program_type IS NULL AND is_deleted = 0""",
            (role_id,),
        )
    else:
        existing = one(
            conn,
            """SELECT id FROM tmext_ai_assessment_requirements
                WHERE role_id = ? AND program_type = ? AND is_deleted = 0""",
            (role_id, program_type),
        )
    if existing:
        raise conflict(
            "REQUIREMENT_EXISTS",
            f"A rule already exists for role {role_id} / {program_type or 'all programs'}",
        )

    ts = now_iso()
    rid = uuid()
    run(
        conn,
        """INSERT INTO tmext_ai_assessment_requirements
             (id, role_id, role_name, program_type, required, created_by, is_deleted, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)""",
        (rid, role_id, role_name, program_type, 1 if required else 0, created_by, ts, ts),
    )
    return get_requirement(conn, rid)


def get_requirement(conn: sqlite3.Connection, rid: str) -> dict[str, Any]:
    row = one(
        conn,
        "SELECT * FROM tmext_ai_assessment_requirements WHERE id = ? AND is_deleted = 0",
        (rid,),
    )
    if not row:
        raise not_found("REQUIREMENT_NOT_FOUND", f"No requirement with id {rid}")
    return row


def update_requirement(
    conn: sqlite3.Connection, rid: str, role_name: str | None = None, required: bool | None = None
) -> dict[str, Any]:
    before = get_requirement(conn, rid)
    run(
        conn,
        """UPDATE tmext_ai_assessment_requirements
              SET role_name = ?, required = ?, updated_at = ? WHERE id = ?""",
        (
            role_name if role_name is not None else before["role_name"],
            before["required"] if required is None else (1 if required else 0),
            now_iso(),
            rid,
        ),
    )
    return get_requirement(conn, rid)


def delete_requirement(conn: sqlite3.Connection, rid: str) -> dict[str, Any]:
    before = get_requirement(conn, rid)
    run(
        conn,
        "UPDATE tmext_ai_assessment_requirements SET is_deleted = 1, updated_at = ? WHERE id = ?",
        (now_iso(), rid),
    )
    return before
