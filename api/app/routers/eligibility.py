from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request, Response

from ..db import get_db, one
from ..errors import bad_request, not_found
from ..security import require_role
from ..services.eligibility import evaluate_eligibility
from ..services.requirements import PROGRAM_TYPES

router = APIRouter()


@router.post("/eligibility")
async def eligibility(request: Request, response: Response) -> dict[str, Any]:
    """
    docs/05 §3 — the ATS calls this when a candidate reaches Shortlisted.

    It answers a question; it does not write to the ATS (invariant 6).
    """
    principal = require_role(request, "CANDIDATE")
    body = await request.json() if await request.body() else {}

    # Invariant 1, enforced rather than assumed. Silently dropping a supplied
    # candidate_id would let a caller believe impersonation had worked.
    if "candidate_id" in body:
        raise bad_request(
            "CANDIDATE_ID_NOT_ACCEPTED",
            "candidate_id is taken from the JWT and must not be sent in the body",
            "candidate_id",
        )

    role_id = body.get("role_id")
    program_type = body.get("program_type")

    if role_id is None:
        raise bad_request("MISSING_FIELD", "role_id is required", "role_id")
    if not isinstance(role_id, int) or isinstance(role_id, bool) or role_id <= 0:
        raise bad_request("INVALID_ROLE_ID", "role_id must be a positive integer", "role_id")
    if program_type is None:
        raise bad_request("MISSING_FIELD", "program_type is required", "program_type")
    if program_type not in PROGRAM_TYPES:
        raise bad_request(
            "INVALID_PROGRAM_TYPE",
            f"program_type must be one of: {', '.join(PROGRAM_TYPES)}",
            "program_type",
        )

    conn = get_db()
    if not one(conn, "SELECT 1 AS ok FROM tmext_job WHERE role_id = ?", (role_id,)):
        raise not_found("ROLE_NOT_FOUND", f"No role with id {role_id}")

    result = evaluate_eligibility(
        conn, principal.sub, role_id, program_type,
        request_id=getattr(request.state, "request_id", None),
    )

    # A point-in-time decision — never cached by a browser or CDN (docs/05 §9.5).
    response.headers["Cache-Control"] = "no-store"
    return {"success": True, "data": result.dict()}
