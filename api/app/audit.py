"""
docs/05 §10 — every eligibility evaluation and admin mutation is recorded.

Evaluations are audited because "why was this candidate skipped?" is a question
compliance will eventually ask, and reconstructing it from settings that have
since changed is otherwise impossible.
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from .db import run, uuid
from .timeutil import now_iso


def audit(
    conn: sqlite3.Connection,
    *,
    actor_type: str,
    action: str,
    actor_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    before: Any = None,
    after: Any = None,
    request_id: str | None = None,
) -> None:
    run(
        conn,
        """INSERT INTO tmext_ai_assessment_audit
             (id, actor_type, actor_id, action, entity_type, entity_id,
              before, after, request_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            uuid(), actor_type, actor_id, action, entity_type, entity_id,
            json.dumps(before) if before is not None else None,
            json.dumps(after) if after is not None else None,
            request_id, now_iso(),
        ),
    )
