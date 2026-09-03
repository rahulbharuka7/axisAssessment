"""Axis Assessment — backend API (FastAPI)."""
from __future__ import annotations

import uuid as _uuid
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import API_PREFIX, IS_PRODUCTION
from .db import get_db
from .errors import ApiError
from .routers import admin, candidate, eligibility, recruiter
from .security import sign_token

app = FastAPI(title="Axis Assessment API", version="1.0.0", docs_url=f"{API_PREFIX}/docs")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def request_id(request: Request, call_next: Any) -> Any:
    """X-Request-Id is accepted and echoed, and flows into every audit row."""
    rid = request.headers.get("x-request-id") or str(_uuid.uuid4())
    request.state.request_id = rid
    response = await call_next(request)
    response.headers["X-Request-Id"] = rid
    return response


# Single error funnel — every failure leaves as the docs/05 §8 envelope.
@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        content={
            "success": False,
            "error": {
                "code": exc.code, "message": exc.message, "field": exc.field,
                "request_id": getattr(request.state, "request_id", None),
            },
        },
    )


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {"code": "INTERNAL_ERROR", "message": "Something went wrong",
                      "request_id": getattr(request.state, "request_id", None)},
        },
    )


@app.on_event("startup")
def startup() -> None:
    get_db()  # apply the schema


@app.get(f"{API_PREFIX}/health")
def health() -> dict[str, Any]:
    return {"success": True, "data": {"status": "ok"}}


@app.post(f"{API_PREFIX}/dev/token")
async def dev_token(request: Request) -> Any:
    """
    Dev-only token mint, so the three persona UIs can be driven without an
    identity provider. In production these come from ThriveHR SSO.
    """
    if IS_PRODUCTION:
        return JSONResponse(status_code=404,
                            content={"success": False, "error": {"code": "NOT_FOUND", "message": "Not found"}})
    body = await request.json()
    sub, role, name = body.get("sub"), body.get("role"), body.get("name")
    if not isinstance(sub, str) or role not in ("CANDIDATE", "RECRUITER", "TA_ADMIN"):
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": {
                "code": "INVALID_PRINCIPAL",
                "message": "sub required; role one of CANDIDATE, RECRUITER, TA_ADMIN"}},
        )
    return {"success": True, "data": {"token": sign_token(sub, role, name), "sub": sub, "role": role, "name": name}}


app.include_router(eligibility.router, prefix=API_PREFIX, tags=["eligibility"])
app.include_router(admin.router, prefix=f"{API_PREFIX}/admin", tags=["admin"])
app.include_router(recruiter.router, prefix=f"{API_PREFIX}/recruiter", tags=["recruiter"])
app.include_router(candidate.router, prefix=f"{API_PREFIX}/candidate", tags=["candidate"])
