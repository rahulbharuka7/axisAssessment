from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from ..audit import audit
from ..db import get_db, many, one
from ..errors import bad_request
from ..security import require_role
from ..services.requirements import (
    PROGRAM_TYPES, create_requirement, delete_requirement,
    get_requirement, list_requirements, update_requirement,
)
from ..services.settings import list_settings, resolve_settings, update_settings

router = APIRouter()


@router.get("/requirements")
def get_requirements(
    request: Request, role_id: int | None = None,
    program_type: str | None = None, required: bool | None = None,
) -> dict[str, Any]:
    require_role(request, "TA_ADMIN")
    return {"success": True, "data": list_requirements(get_db(), role_id, program_type, required)}


@router.post("/requirements", status_code=201)
async def post_requirement(request: Request) -> dict[str, Any]:
    principal = require_role(request, "TA_ADMIN")
    body = await request.json()

    role_id = body.get("role_id")
    role_name = body.get("role_name")
    program_type = body.get("program_type")
    required = body.get("required")

    if not isinstance(role_id, int) or isinstance(role_id, bool) or role_id <= 0:
        raise bad_request("INVALID_ROLE_ID", "role_id must be a positive integer", "role_id")
    if not isinstance(role_name, str) or not role_name.strip():
        raise bad_request("MISSING_FIELD", "role_name is required", "role_name")
    if program_type is not None and program_type not in PROGRAM_TYPES:
        raise bad_request(
            "INVALID_PROGRAM_TYPE",
            f"program_type must be null (all programs) or one of: {', '.join(PROGRAM_TYPES)}",
            "program_type",
        )
    if not isinstance(required, bool):
        raise bad_request("MISSING_FIELD", "required must be a boolean", "required")

    conn = get_db()
    data = create_requirement(conn, role_id, role_name.strip(), program_type, required, principal.sub)
    audit(conn, actor_type="admin", actor_id=principal.sub, action="requirements.create",
          entity_type="requirement", entity_id=data["id"], after=data,
          request_id=getattr(request.state, "request_id", None))
    return {"success": True, "data": data}


@router.post("/requirements/{rid}/update")
async def patch_requirement(rid: str, request: Request) -> dict[str, Any]:
    principal = require_role(request, "TA_ADMIN")
    body = await request.json()
    conn = get_db()
    before = get_requirement(conn, rid)
    data = update_requirement(conn, rid, body.get("role_name"), body.get("required"))
    audit(conn, actor_type="admin", actor_id=principal.sub, action="requirements.update",
          entity_type="requirement", entity_id=rid, before=before, after=data,
          request_id=getattr(request.state, "request_id", None))
    return {"success": True, "data": data}


@router.post("/requirements/{rid}/delete")
def remove_requirement(rid: str, request: Request) -> dict[str, Any]:
    principal = require_role(request, "TA_ADMIN")
    conn = get_db()
    before = delete_requirement(conn, rid)
    audit(conn, actor_type="admin", actor_id=principal.sub, action="requirements.delete",
          entity_type="requirement", entity_id=rid, before=before,
          request_id=getattr(request.state, "request_id", None))
    return {"success": True, "data": {"id": rid, "deleted": True}}


@router.get("/settings")
def get_settings(request: Request) -> dict[str, Any]:
    require_role(request, "TA_ADMIN")
    return {"success": True, "data": list_settings(get_db())}


@router.post("/settings/update")
async def post_settings(request: Request) -> dict[str, Any]:
    principal = require_role(request, "TA_ADMIN")
    body = await request.json()
    conn = get_db()
    before = resolve_settings(conn)
    data = update_settings(conn, None, body, principal.sub)
    audit(conn, actor_type="admin", actor_id=principal.sub, action="settings.update",
          entity_type="settings", entity_id="global", before=before, after=data,
          request_id=getattr(request.state, "request_id", None))
    return {"success": True, "data": data}


@router.post("/settings/{role_id}/update")
async def post_role_settings(role_id: int, request: Request) -> dict[str, Any]:
    principal = require_role(request, "TA_ADMIN")
    body = await request.json()
    conn = get_db()
    data = update_settings(conn, role_id, body, principal.sub)
    audit(conn, actor_type="admin", actor_id=principal.sub, action="settings.update",
          entity_type="settings", entity_id=str(role_id), after=data,
          request_id=getattr(request.state, "request_id", None))
    return {"success": True, "data": data}


@router.get("/audit")
def get_audit(request: Request, page: int = 1, page_size: int = 50, action: str | None = None) -> dict[str, Any]:
    require_role(request, "TA_ADMIN")
    conn = get_db()
    limit = min(page_size, 200)
    page = max(1, page)
    where = "WHERE action = ?" if action else ""
    params: list[Any] = [action] if action else []
    total_row = one(conn, f"SELECT COUNT(*) AS n FROM tmext_ai_assessment_audit {where}", params)
    rows = many(
        conn,
        f"SELECT * FROM tmext_ai_assessment_audit {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        [*params, limit, (page - 1) * limit],
    )
    return {
        "success": True, "data": rows,
        "total": int(total_row["n"]) if total_row else 0,
        "page": page, "page_size": limit,
    }
