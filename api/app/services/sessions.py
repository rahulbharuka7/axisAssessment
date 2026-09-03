from __future__ import annotations

import json
import sqlite3
from typing import Any

from ..audit import audit
from ..db import many, one, run, uuid
from ..errors import bad_request, conflict, forbidden, not_found
from ..timeutil import iso_plus_minutes, now_iso, parse
from .eligibility import evaluate_eligibility
from .settings import resolve_settings


def get_session(conn: sqlite3.Connection, sid: str) -> dict[str, Any]:
    row = one(conn, "SELECT * FROM tmext_ai_assessment_sessions WHERE id = ? AND is_deleted = 0", (sid,))
    if not row:
        raise not_found("SESSION_NOT_FOUND", f"No session with id {sid}")
    return row


def assert_owner(session: dict[str, Any], candidate_id: str) -> None:
    if session["candidate_id"] != candidate_id:
        raise forbidden("This session belongs to another candidate")


def start_session(
    conn: sqlite3.Connection, candidate_id: str, role_id: int, program_type: str,
    *, request_id: str | None = None,
) -> tuple[dict[str, Any], bool]:
    """
    Start a new session, or resume the one already in flight.

    Gated on the same eligibility evaluation the ATS calls, so the rules cannot be
    bypassed by POSTing straight here — a candidate inside a cooling lockout must
    not be able to start a test by skipping the UI.
    """
    elig = evaluate_eligibility(
        conn, candidate_id, role_id, program_type, request_id=request_id, skip_audit=True
    )

    if elig.status == "PENDING" and elig.prior_session_id:
        return get_session(conn, elig.prior_session_id), True
    if not elig.show_button:
        raise conflict("NOT_ELIGIBLE_TO_START", f"Cannot start: {elig.status} ({elig.reason})")

    settings = resolve_settings(conn, role_id)
    test = one(
        conn,
        """SELECT id, blueprint_id, duration_minutes FROM tmext_ai_test
            WHERE role_id = ? AND program_type = ? AND status = 'live' AND is_deleted = 0
            ORDER BY created_at DESC LIMIT 1""",
        (role_id, program_type),
    )
    if not test:
        raise not_found("NO_LIVE_TEST", f"No live test for role {role_id} / {program_type}")

    prior = one(
        conn,
        """SELECT COUNT(*) AS n FROM tmext_ai_assessment_sessions
            WHERE candidate_id = ? AND role_id = ? AND is_deleted = 0""",
        (candidate_id, role_id),
    )
    attempt = (int(prior["n"]) if prior else 0) + 1

    ts = now_iso()
    sid = uuid()
    run(
        conn,
        """INSERT INTO tmext_ai_assessment_sessions
             (id, candidate_id, role_id, program_type, test_id, blueprint_id, status,
              consent_at, started_at, expires_at, attempt_number, is_deleted, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, 0, ?, ?)""",
        (
            sid, candidate_id, role_id, program_type, test["id"], test["blueprint_id"],
            ts, ts,
            # docs/05 §12.4 — every session gets an exit.
            iso_plus_minutes(ts, settings["session_ttl_minutes"]),
            attempt, ts, ts,
        ),
    )

    audit(
        conn, actor_type="candidate", actor_id=candidate_id, action="session.start",
        entity_type="session", entity_id=sid,
        after={"role_id": role_id, "program_type": program_type, "attempt_number": attempt},
        request_id=request_id,
    )
    return get_session(conn, sid), False


def time_remaining_seconds(conn: sqlite3.Connection, session: dict[str, Any]) -> int:
    """Server-authoritative. The client clock is display only."""
    if not session["started_at"]:
        return 0
    test = one(conn, "SELECT duration_minutes FROM tmext_ai_test WHERE id = ?", (session["test_id"],))
    minutes = (test["duration_minutes"] if test and test["duration_minutes"] else 60)
    ends = parse(session["started_at"]).timestamp() + minutes * 60
    return max(0, int(ends - parse(now_iso()).timestamp()))


def save_answer(
    conn: sqlite3.Connection, session: dict[str, Any], question_id: str,
    value: Any, client_revision: int = 0, marked_review: bool = False,
) -> dict[str, Any]:
    """
    Idempotent on (session_id, question_id, client_revision).

    An autosave retried after a dropped connection must never duplicate, and a
    late-arriving retry must never clobber a newer answer. A lower revision is
    accepted-but-ignored, not an error — the client has already moved on and does
    not need a failure.
    """
    if session["status"] != "in_progress":
        raise conflict("SESSION_NOT_ACTIVE", f"Session is {session['status']}")

    belongs = one(
        conn,
        "SELECT 1 AS ok FROM tmext_ai_test_question WHERE test_id = ? AND question_id = ?",
        (session["test_id"], question_id),
    )
    if not belongs:
        raise bad_request("QUESTION_NOT_IN_TEST", "Question is not part of this test")

    existing = one(
        conn,
        "SELECT client_revision FROM tmext_ai_answer WHERE session_id = ? AND question_id = ?",
        (session["id"], question_id),
    )
    if existing and existing["client_revision"] >= client_revision:
        return {"accepted": False, "revision": existing["client_revision"]}

    ts = now_iso()
    run(
        conn,
        """INSERT INTO tmext_ai_answer
             (id, session_id, question_id, value, client_revision, marked_review, answered_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (session_id, question_id) DO UPDATE SET
             value = excluded.value, client_revision = excluded.client_revision,
             marked_review = excluded.marked_review, updated_at = excluded.updated_at""",
        (uuid(), session["id"], question_id, json.dumps(value),
         client_revision, 1 if marked_review else 0, ts, ts),
    )
    return {"accepted": True, "revision": client_revision}


def submit_session(
    conn: sqlite3.Connection, session: dict[str, Any],
    *, auto: bool = False, request_id: str | None = None,
) -> dict[str, Any]:
    """Idempotent — a double-submit returns the original submission."""
    if session["status"] != "in_progress":
        return get_session(conn, session["id"])

    ts = now_iso()
    run(
        conn,
        "UPDATE tmext_ai_assessment_sessions SET status = 'submitted', submitted_at = ?, updated_at = ? WHERE id = ?",
        (ts, ts, session["id"]),
    )
    audit(
        conn, actor_type="candidate", actor_id=session["candidate_id"],
        action="session.auto_submit" if auto else "session.submit",
        entity_type="session", entity_id=session["id"], request_id=request_id,
    )
    return get_session(conn, session["id"])
