"""
Uniform error envelope — docs/05 §8.

Every failure leaves the API as {"success": false, "error": {...}}.
"""
from __future__ import annotations


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, field: str | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.field = field


def bad_request(code: str, message: str, field: str | None = None) -> ApiError:
    return ApiError(400, code, message, field)


def unauthenticated(message: str = "Authentication required") -> ApiError:
    return ApiError(401, "UNAUTHENTICATED", message)


def forbidden(message: str = "Not permitted for this role") -> ApiError:
    return ApiError(403, "FORBIDDEN", message)


def not_found(code: str, message: str) -> ApiError:
    return ApiError(404, code, message)


def conflict(code: str, message: str) -> ApiError:
    return ApiError(409, code, message)


def unavailable(code: str, message: str) -> ApiError:
    return ApiError(503, code, message)
