"""JWT authentication and role enforcement for the three personas."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from fastapi import Request

from .config import JWT_ALGORITHM, JWT_SECRET, JWT_TTL_HOURS
from .errors import forbidden, unauthenticated

Role = Literal["CANDIDATE", "RECRUITER", "TA_ADMIN"]


@dataclass(frozen=True)
class Principal:
    sub: str
    role: Role
    name: str | None = None


def sign_token(sub: str, role: Role, name: str | None = None) -> str:
    payload = {
        "sub": sub,
        "role": role,
        "name": name,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> Principal:
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise unauthenticated("Token is missing, malformed or expired") from exc
    return Principal(sub=claims["sub"], role=claims["role"], name=claims.get("name"))


def principal_from(request: Request) -> Principal:
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise unauthenticated()
    return verify_token(header[7:].strip())


def require_role(request: Request, *roles: Role) -> Principal:
    """
    401 and 403 are distinguished deliberately: "you are not signed in" and
    "you are signed in as the wrong persona" need different fixes from the caller.
    """
    p = principal_from(request)
    if p.role not in roles:
        raise forbidden(f"This endpoint requires: {' or '.join(roles)}")
    return p
