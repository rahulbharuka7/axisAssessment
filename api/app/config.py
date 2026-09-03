"""Runtime configuration. Every value is env-overridable; nothing is hardcoded."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR.parent / "data"))
DB_PATH = os.getenv("DB_PATH", str(DATA_DIR / "assessment.db"))
SCHEMA_PATH = BASE_DIR / "schema.sql"

JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_TTL_HOURS = int(os.getenv("JWT_TTL_HOURS", "12"))

API_PREFIX = "/ai-assessment/api/v1"

# The AI service (docs/08) runs separately so scoring can scale independently of
# the request path and a slow model never blocks a candidate's autosave.
AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:4100")
AI_SERVICE_TIMEOUT = float(os.getenv("AI_SERVICE_TIMEOUT", "30"))

ENV = os.getenv("ENV", "development")
IS_PRODUCTION = ENV == "production"
