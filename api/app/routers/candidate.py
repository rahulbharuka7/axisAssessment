from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request, Response

from ..db import get_db, loads, many, one, run, uuid
from ..errors import bad_request
from ..security import require_role
from ..services.requirements import PROGRAM_TYPES
from ..services.scoring import score_session
from ..services.sessions import (
    assert_owner, get_session, save_answer, start_session, submit_session, time_remaining_seconds,
)
from ..services.settings import resolve_settings
from ..timeutil import now_iso

router = APIRouter()


def _rid(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


@router.post("/sessions/start")
async def start(request: Request) -> dict[str, Any]:
    principal = require_role(request, "CANDIDATE")
    body = await request.json()
    role_id, program_type = body.get("role_id"), body.get("program_type")
    if not isinstance(role_id, int) or isinstance(role_id, bool):
        raise bad_request("INVALID_ROLE_ID", "role_id must be an integer", "role_id")
    if program_type not in PROGRAM_TYPES:
        raise bad_request("INVALID_PROGRAM_TYPE", f"program_type must be one of: {', '.join(PROGRAM_TYPES)}")
    session, resumed = start_session(get_db(), principal.sub, role_id, program_type, request_id=_rid(request))
    return {"success": True, "data": {**session, "resumed": resumed}}


@router.get("/sessions/{sid}")
def read(sid: str, request: Request, response: Response) -> dict[str, Any]:
    principal = require_role(request, "CANDIDATE")
    conn = get_db()
    session = get_session(conn, sid)
    assert_owner(session, principal.sub)

    rows = many(
        conn,
        """SELECT q.id, q.question_type, q.difficulty, q.body, q.media, q.options,
                  q.marks_correct, q.expected_time_sec,
                  c.name AS competency, s.id AS section_id, s.tool,
                  s.duration_minutes AS section_minutes, tq.display_order,
                  a.value AS answer, a.client_revision, a.marked_review
             FROM tmext_ai_test_question tq
             JOIN tmext_ai_question q          ON q.id = tq.question_id
             JOIN tmext_ai_competency c        ON c.id = q.competency_id
             JOIN tmext_ai_blueprint_section s ON s.id = tq.section_id
             LEFT JOIN tmext_ai_answer a       ON a.session_id = ? AND a.question_id = q.id
            WHERE tq.test_id = ?
            ORDER BY tq.display_order""",
        (sid, session["test_id"]),
    )

    # The answer key never leaves the server — it is not in the SELECT above.
    questions = [
        {**r,
         "media": loads(r["media"]),
         "options": loads(r["options"]),
         "answer": loads(r["answer"]),
         "marked_review": r["marked_review"] == 1}
        for r in rows
    ]

    response.headers["Cache-Control"] = "no-store"
    return {
        "success": True,
        "data": {
            "session": session,
            "questions": questions,
            "time_remaining_seconds": time_remaining_seconds(conn, session),
        },
    }


@router.post("/sessions/{sid}/answers")
async def answer(sid: str, request: Request) -> dict[str, Any]:
    principal = require_role(request, "CANDIDATE")
    conn = get_db()
    session = get_session(conn, sid)
    assert_owner(session, principal.sub)

    body = await request.json()
    question_id = body.get("question_id")
    if not isinstance(question_id, str):
        raise bad_request("MISSING_FIELD", "question_id is required", "question_id")

    result = save_answer(
        conn, session, question_id, body.get("value"),
        int(body.get("client_revision") or 0), bool(body.get("marked_review")),
    )
    return {"success": True, "data": {**result, "time_remaining_seconds": time_remaining_seconds(conn, session)}}


@router.post("/sessions/{sid}/answers/batch")
async def answer_batch(sid: str, request: Request) -> dict[str, Any]:
    """Flush an offline buffer. Per-answer accepted/rejected, never all-or-nothing."""
    principal = require_role(request, "CANDIDATE")
    conn = get_db()
    session = get_session(conn, sid)
    assert_owner(session, principal.sub)

    body = await request.json()
    answers = body.get("answers")
    if not isinstance(answers, list):
        raise bad_request("MISSING_FIELD", "answers must be an array", "answers")

    results = []
    for a in answers:
        try:
            r = save_answer(
                conn, session, a["question_id"], a.get("value"),
                int(a.get("client_revision") or 0), bool(a.get("marked_review")),
            )
            results.append({"question_id": a.get("question_id"), **r})
        except Exception as exc:  # noqa: BLE001
            results.append({"question_id": a.get("question_id"), "accepted": False, "error": str(exc)})

    return {"success": True, "data": {"results": results,
                                      "time_remaining_seconds": time_remaining_seconds(conn, session)}}


@router.post("/sessions/{sid}/heartbeat")
def heartbeat(sid: str, request: Request) -> dict[str, Any]:
    """Liveness plus the authoritative timer. Auto-submits when time is up."""
    principal = require_role(request, "CANDIDATE")
    conn = get_db()
    session = get_session(conn, sid)
    assert_owner(session, principal.sub)

    remaining = time_remaining_seconds(conn, session)
    if remaining <= 0 and session["status"] == "in_progress":
        session = submit_session(conn, session, auto=True, request_id=_rid(request))
        session = score_session(conn, session["id"], request_id=_rid(request))

    return {"success": True, "data": {"status": session["status"], "time_remaining_seconds": max(0, remaining)}}


@router.post("/sessions/{sid}/proctor-events")
async def proctor_events(sid: str, request: Request) -> dict[str, Any]:
    principal = require_role(request, "CANDIDATE")
    conn = get_db()
    session = get_session(conn, sid)
    assert_owner(session, principal.sub)

    body = await request.json()
    events = body.get("events") or []
    ts = now_iso()
    for e in events:
        run(
            conn,
            """INSERT INTO tmext_ai_proctor_flag
                 (id, session_id, flag_type, started_at_ms, duration_ms, confidence,
                  detected_by, model_version, evidence, warned, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 'realtime', ?, NULL, ?, ?)""",
            (uuid(), sid, str(e.get("flag_type", "UNKNOWN")), int(e.get("started_at_ms") or 0),
             e.get("duration_ms"), float(e.get("confidence", 1.0)),
             str(e.get("model_version", "browser-v1")), 1 if e.get("warned") else 0, ts),
        )

    total = one(conn, "SELECT COUNT(*) AS n FROM tmext_ai_proctor_flag WHERE session_id = ?", (sid,))
    return {"success": True, "data": {"recorded": len(events), "total_flags": int(total["n"]) if total else 0}}


@router.post("/sessions/{sid}/submit")
def submit(sid: str, request: Request) -> dict[str, Any]:
    principal = require_role(request, "CANDIDATE")
    conn = get_db()
    session = get_session(conn, sid)
    assert_owner(session, principal.sub)

    submitted = submit_session(conn, session, request_id=_rid(request))
    scored = score_session(conn, submitted["id"], request_id=_rid(request))
    answered = one(conn, "SELECT COUNT(*) AS n FROM tmext_ai_answer WHERE session_id = ?", (sid,))

    return {
        "success": True,
        "data": {
            "id": scored["id"], "status": scored["status"], "submitted_at": scored["submitted_at"],
            "answers_received": int(answered["n"]) if answered else 0,
            "reference": f"ASMT-{now_iso()[:4]}-{scored['id'][:6].upper()}",
        },
    }


@router.get("/sessions/{sid}/result")
def result(sid: str, request: Request) -> dict[str, Any]:
    """
    Filtered by the Admin's visibility policy (docs/04 §3.7).

    Scores are never returned alongside proctoring flags at any level — a candidate
    must not be able to infer what the detector caught, which would be a roadmap
    for the next attempt.
    """
    principal = require_role(request, "CANDIDATE")
    conn = get_db()
    session = get_session(conn, sid)
    assert_owner(session, principal.sub)

    settings = resolve_settings(conn, session["role_id"])
    base = {"id": session["id"], "status": session["status"], "submitted_at": session["submitted_at"]}

    if settings["result_visibility"] == "none" or session["status"] != "scored":
        return {"success": True, "data": {**base, "visibility": "none"}}
    if settings["result_visibility"] == "basic":
        return {"success": True, "data": {**base, "visibility": "basic", "outcome": session["outcome"]}}
    return {
        "success": True,
        "data": {
            **base, "visibility": "detailed", "outcome": session["outcome"],
            "total_score": session["total_score"], "max_score": session["max_score"],
            "sections": loads(session["section_scores"], []),
        },
    }
