from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request, Response

from ..audit import audit
from ..db import get_db, loads, many, one, run, uuid
from ..errors import bad_request, not_found
from ..security import require_role
from ..services.eligibility import evaluate_eligibility
from ..services.scoring import compute_risk
from ..timeutil import now_iso

router = APIRouter()
ROLES = ("RECRUITER", "TA_ADMIN")


@router.get("/tests")
def tests(request: Request) -> dict[str, Any]:
    require_role(request, *ROLES)
    rows = many(
        get_db(),
        """SELECT t.*, b.name AS blueprint_name,
                  (SELECT COUNT(*) FROM tmext_ai_assessment_sessions s
                    WHERE s.test_id = t.id AND s.is_deleted = 0) AS invited,
                  (SELECT COUNT(*) FROM tmext_ai_assessment_sessions s
                    WHERE s.test_id = t.id AND s.status = 'scored' AND s.is_deleted = 0) AS completed,
                  (SELECT COUNT(*) FROM tmext_ai_assessment_sessions s
                    WHERE s.test_id = t.id AND s.risk_band IN ('medium','high') AND s.is_deleted = 0) AS flagged
             FROM tmext_ai_test t
             JOIN tmext_ai_blueprint b ON b.id = t.blueprint_id
            WHERE t.is_deleted = 0
            ORDER BY t.created_at DESC""",
    )
    return {"success": True, "data": [{**r, "proctoring": loads(r["proctoring"], {})} for r in rows]}


@router.get("/tests/{tid}/candidates")
def candidates(tid: str, request: Request, risk: str | None = None, status: str | None = None) -> dict[str, Any]:
    require_role(request, *ROLES)
    where = ["s.test_id = ?", "s.is_deleted = 0"]
    params: list[Any] = [tid]
    if risk:
        where.append("s.risk_band = ?")
        params.append(risk)
    if status:
        where.append("s.status = ?")
        params.append(status)

    rows = many(
        get_db(),
        f"""SELECT s.id, s.candidate_id, s.status, s.outcome, s.total_score, s.max_score,
                   s.risk_score, s.risk_band, s.attempt_number, s.started_at, s.submitted_at,
                   s.section_scores,
                   (SELECT COUNT(*) FROM tmext_ai_proctor_flag f WHERE f.session_id = s.id) AS flag_count
              FROM tmext_ai_assessment_sessions s
             WHERE {' AND '.join(where)}
             ORDER BY CASE s.risk_band WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                      s.total_score DESC""",
        params,
    )
    return {"success": True, "data": [{**r, "section_scores": loads(r["section_scores"], [])} for r in rows]}


@router.get("/sessions/{sid}/report")
def report(sid: str, request: Request, response: Response) -> dict[str, Any]:
    require_role(request, *ROLES)
    conn = get_db()
    session = one(conn, "SELECT * FROM tmext_ai_assessment_sessions WHERE id = ? AND is_deleted = 0", (sid,))
    if not session:
        raise not_found("SESSION_NOT_FOUND", f"No session with id {sid}")

    flags = many(
        conn,
        "SELECT * FROM tmext_ai_proctor_flag WHERE session_id = ? ORDER BY started_at_ms",
        (sid,),
    )
    response.headers["Cache-Control"] = "no-store"
    return {
        "success": True,
        "data": {
            "session": {**session, "section_scores": loads(session["section_scores"], [])},
            "flags": [{**f, "evidence": loads(f["evidence"]), "warned": f["warned"] == 1} for f in flags],
        },
    }


@router.post("/sessions/{sid}/flags/{fid}/review")
async def review_flag(sid: str, fid: str, request: Request) -> dict[str, Any]:
    """
    The override loop from docs/08 §7 — a labelled false positive is the training
    signal that makes the next model better, so the note is mandatory.
    """
    principal = require_role(request, *ROLES)
    body = await request.json()
    verdict, note = body.get("verdict"), body.get("note")

    if verdict not in ("genuine", "false_positive"):
        raise bad_request("INVALID_VERDICT", "verdict must be 'genuine' or 'false_positive'", "verdict")
    if not isinstance(note, str) or not note.strip():
        raise bad_request("MISSING_FIELD", "A note is required so the label can be audited", "note")

    conn = get_db()
    cur = run(
        conn,
        """UPDATE tmext_ai_proctor_flag
              SET review_verdict = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?
            WHERE id = ? AND session_id = ?""",
        (verdict, note.strip(), principal.sub, now_iso(), fid, sid),
    )
    if cur.rowcount == 0:
        raise not_found("FLAG_NOT_FOUND", "No such flag on this session")

    # Recompute — a corrected session's risk should reflect the human verdict.
    risk = compute_risk(conn, sid)
    run(
        conn,
        "UPDATE tmext_ai_assessment_sessions SET risk_score = ?, risk_band = ?, updated_at = ? WHERE id = ?",
        (risk["score"], risk["band"], now_iso(), sid),
    )
    audit(conn, actor_type="recruiter", actor_id=principal.sub, action="flag.review",
          entity_type="flag", entity_id=fid,
          after={"verdict": verdict, "note": note, "recomputed_risk": risk},
          request_id=getattr(request.state, "request_id", None))
    return {"success": True, "data": {"flag_id": fid, "verdict": verdict, "risk": risk}}


@router.post("/sessions/{sid}/decision")
async def decision(sid: str, request: Request) -> dict[str, Any]:
    principal = require_role(request, *ROLES)
    body = await request.json()
    choice = body.get("decision")
    if choice not in ("shortlist", "reject", "hold"):
        raise bad_request("INVALID_DECISION", "decision must be 'shortlist', 'reject' or 'hold'", "decision")

    audit(get_db(), actor_type="recruiter", actor_id=principal.sub, action="session.decision",
          entity_type="session", entity_id=sid,
          after={"decision": choice, "note": body.get("note")},
          request_id=getattr(request.state, "request_id", None))

    # Invariant 6 — the module does not write to the ATS. In production this emits
    # the assessment.decided webhook (docs/06 §4) and the ATS persists it.
    return {"success": True, "data": {"session_id": sid, "decision": choice,
                                      "webhook": "assessment.decided queued"}}


@router.post("/candidates/{candidate_id}/grant-attempt", status_code=201)
async def grant_attempt(candidate_id: str, request: Request) -> dict[str, Any]:
    """docs/05 §7.2 — a genuine mishap gets a supported path, not a config edit."""
    principal = require_role(request, *ROLES)
    body = await request.json()
    role_id, reason = body.get("role_id"), body.get("reason")

    if not isinstance(role_id, int) or isinstance(role_id, bool):
        raise bad_request("INVALID_ROLE_ID", "role_id must be an integer", "role_id")
    if not isinstance(reason, str) or not reason.strip():
        raise bad_request("MISSING_FIELD", "reason is required and is audited", "reason")

    conn = get_db()
    row = {
        "id": uuid(), "candidate_id": candidate_id, "role_id": role_id,
        "reason": reason.strip(), "granted_by": principal.sub, "created_at": now_iso(),
    }
    run(
        conn,
        """INSERT INTO tmext_ai_attempt_grant
             (id, candidate_id, role_id, reason, granted_by, is_deleted, created_at)
           VALUES (?, ?, ?, ?, ?, 0, ?)""",
        (row["id"], candidate_id, role_id, row["reason"], principal.sub, row["created_at"]),
    )
    audit(conn, actor_type="recruiter", actor_id=principal.sub, action="attempt.grant",
          entity_type="candidate", entity_id=candidate_id, after=row,
          request_id=getattr(request.state, "request_id", None))
    return {"success": True, "data": row}


@router.post("/tests/{tid}/invite/preview")
async def invite_preview(tid: str, request: Request) -> dict[str, Any]:
    """
    Runs eligibility per candidate BEFORE sending, so a recruiter knows they are
    inviting 96 people rather than 120 (docs/06 §2.2).
    """
    require_role(request, *ROLES)
    conn = get_db()
    test = one(conn, "SELECT role_id, program_type FROM tmext_ai_test WHERE id = ? AND is_deleted = 0", (tid,))
    if not test:
        raise not_found("TEST_NOT_FOUND", f"No test with id {tid}")

    body = await request.json()
    ids = body.get("candidate_ids") or []
    rows = []
    breakdown: dict[str, int] = {}
    for cid in ids:
        e = evaluate_eligibility(conn, cid, test["role_id"], test["program_type"], skip_audit=True)
        rows.append({"candidate_id": cid, "status": e.status, "reason": e.reason,
                     "show_button": e.show_button})
        breakdown[e.status] = breakdown.get(e.status, 0) + 1

    return {
        "success": True,
        "data": {"total": len(rows), "will_invite": sum(1 for r in rows if r["show_button"]),
                 "breakdown": breakdown, "rows": rows},
    }
