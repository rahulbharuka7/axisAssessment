"""
The eligibility engine — docs/05.

This is the spine of the module: a session's outcome is the input to the
eligibility decision the next time that candidate applies.
"""
from __future__ import annotations

import sqlite3
from dataclasses import asdict, dataclass
from typing import Any, Literal

from ..audit import audit
from ..db import one
from ..timeutil import is_future, iso_plus_days, now_iso
from .requirements import resolve_requirement
from .settings import resolve_settings

Status = Literal["NOT_APPLICABLE", "SKIP", "PENDING_COOLING", "PENDING", "NOT_ELIGIBLE", "ELIGIBLE"]

ACTIVE_STATUSES = ("in_progress", "submitted", "scoring")


@dataclass
class EligibilityResult:
    role_id: int
    role_name: str | None
    program_type: str
    status: Status
    reason: str
    show_button: bool           # invariant 5 — the only field the frontend branches on
    prior_session_id: str | None
    cooling_ends_at: str | None
    attempts_used: int
    max_attempts: int | None
    blueprint_id: str | None
    estimated_duration_minutes: int | None
    evaluated_at: str

    def dict(self) -> dict[str, Any]:
        return asdict(self)


def _count_attempts(conn: sqlite3.Connection, candidate_id: str, role_id: int) -> int:
    row = one(
        conn,
        """SELECT COUNT(*) AS n FROM tmext_ai_assessment_sessions
            WHERE candidate_id = ? AND role_id = ? AND is_deleted = 0 AND status = 'scored'""",
        (candidate_id, role_id),
    )
    return int(row["n"]) if row else 0


def _effective_max_attempts(
    conn: sqlite3.Connection, candidate_id: str, role_id: int, configured: int | None
) -> int | None:
    """
    The configured ceiling plus recruiter-granted exceptions (docs/05 §7.2), so a
    genuine power cut has a supported path that is not "an admin edits global config".
    """
    if configured is None:
        return None
    row = one(
        conn,
        """SELECT COUNT(*) AS n FROM tmext_ai_attempt_grant
            WHERE candidate_id = ? AND role_id = ? AND is_deleted = 0""",
        (candidate_id, role_id),
    )
    return configured + (int(row["n"]) if row else 0)


def evaluate_eligibility(
    conn: sqlite3.Connection,
    candidate_id: str,
    role_id: int,
    program_type: str,
    *,
    request_id: str | None = None,
    skip_audit: bool = False,
) -> EligibilityResult:
    """
    Decide whether a candidate must take the assessment for a role.

    Step order matters and is not the order in the source spec — see docs/05 §12.1.
    The original ran the history check first, asking for a prior *scored* session.
    A candidate mid-test on their first ever attempt has none, so it returned
    ELIGIBLE / NO_PRIOR_RECORD and stopped, making ATTEMPT_IN_PROGRESS unreachable
    for exactly the case it exists to cover — the candidate was shown a second
    "Start Assessment" button while attempt one was still running.
    """
    evaluated_at = now_iso()

    # ── Step 0 — resolve config. Raises 503 if settings are unreachable.
    settings = resolve_settings(conn, role_id)

    job = one(conn, "SELECT role_name FROM tmext_job WHERE role_id = ?", (role_id,))

    def finish(**kw: Any) -> EligibilityResult:
        result = EligibilityResult(
            role_id=role_id,
            program_type=program_type,
            evaluated_at=evaluated_at,
            **{
                "role_name": None, "prior_session_id": None, "cooling_ends_at": None,
                "blueprint_id": None, "estimated_duration_minutes": None,
                "attempts_used": 0, "max_attempts": settings["max_attempts"],
                **kw,
            },
        )
        if not skip_audit:
            audit(
                conn,
                actor_type="candidate",
                actor_id=candidate_id,
                action="eligibility.evaluate",
                entity_type="role",
                entity_id=str(role_id),
                after={
                    "status": result.status, "reason": result.reason,
                    "show_button": result.show_button, "program_type": program_type,
                },
                request_id=request_id,
            )
        return result

    # ── Step 1 — requirements table, most-specific-wins (docs/05 §2.1).
    requirement = resolve_requirement(conn, role_id, program_type)
    role_name = requirement["role_name"] if requirement else (job["role_name"] if job else None)

    # A miss defaults to NOT_APPLICABLE — fail safe (invariant 3). Never block a
    # candidate because a config row is missing.
    if not requirement or requirement["required"] != 1:
        return finish(
            role_name=role_name, status="NOT_APPLICABLE",
            reason="ROLE_NOT_REQUIRED", show_button=False,
        )

    blueprint = one(
        conn,
        """SELECT id, total_duration_minutes FROM tmext_ai_blueprint
            WHERE role_id = ? AND status = 'published' AND is_deleted = 0
            ORDER BY version DESC LIMIT 1""",
        (role_id,),
    )
    ctx: dict[str, Any] = {
        "role_name": role_name,
        "blueprint_id": blueprint["id"] if blueprint else None,
        "estimated_duration_minutes": blueprint["total_duration_minutes"] if blueprint else None,
    }

    attempts_used = _count_attempts(conn, candidate_id, role_id)
    max_attempts = _effective_max_attempts(conn, candidate_id, role_id, settings["max_attempts"])
    ctx |= {"attempts_used": attempts_used, "max_attempts": max_attempts}

    # ── Step 2 — active session, BEFORE history (docs/05 §12.1).
    placeholders = ",".join("?" * len(ACTIVE_STATUSES))
    active = one(
        conn,
        f"""SELECT id, status, outcome, scored_at, expires_at FROM tmext_ai_assessment_sessions
             WHERE candidate_id = ? AND role_id = ? AND is_deleted = 0
               AND status IN ({placeholders})
             ORDER BY created_at DESC LIMIT 1""",
        (candidate_id, role_id, *ACTIVE_STATUSES),
    )

    if active:
        expired = (
            active["status"] == "in_progress"
            and active["expires_at"] is not None
            and not is_future(active["expires_at"], evaluated_at)
        )
        if not expired:
            return finish(**ctx, status="PENDING", reason="ATTEMPT_IN_PROGRESS",
                          show_button=False, prior_session_id=active["id"])

        # Lazy sweep — docs/05 §12.4. Without this, a dead laptop leaves the
        # session in_progress forever and every future call returns PENDING with
        # no button: a permanent, silent block with no self-service recovery.
        conn.execute(
            "UPDATE tmext_ai_assessment_sessions SET status = 'expired', updated_at = ? WHERE id = ?",
            (evaluated_at, active["id"]),
        )
        conn.commit()
        audit(
            conn, actor_type="system", action="session.expire",
            entity_type="session", entity_id=active["id"],
            after={"reason": "ttl_elapsed", "expires_at": active["expires_at"]},
            request_id=request_id,
        )

    # ── Step 3 — history. Only *scored* sessions count.
    last = one(
        conn,
        """SELECT id, outcome, scored_at FROM tmext_ai_assessment_sessions
            WHERE candidate_id = ? AND role_id = ? AND is_deleted = 0
              AND status = 'scored' AND scored_at IS NOT NULL
            ORDER BY scored_at DESC LIMIT 1""",
        (candidate_id, role_id),
    )

    if not last:
        return finish(**ctx, status="ELIGIBLE", reason="NO_PRIOR_RECORD", show_button=True)

    # ── Step 4 — outcome + cooling, measured from scored_at (invariant 9).
    #
    # A slow scoring queue must not shorten a lockout or lengthen a carry-forward,
    # which is why submitted_at and started_at are deliberately not used here.
    passed = last["outcome"] == "pass"
    days = settings["cooling_period_pass_days"] if passed else settings["cooling_period_fail_days"]
    cooling_ends_at = iso_plus_days(last["scored_at"], days)

    # An 'inconclusive' outcome (a voided or fraud-flagged session) is not a valid
    # result in either direction. It falls through the `passed` check to the fail
    # branch, so a recruiter decides rather than the candidate silently retrying.
    if is_future(cooling_ends_at, evaluated_at):
        return finish(
            **ctx,
            status="SKIP" if passed else "PENDING_COOLING",
            reason="PRIOR_PASS_IN_COOLING" if passed else "PRIOR_FAIL_IN_COOLING",
            show_button=False, prior_session_id=last["id"], cooling_ends_at=cooling_ends_at,
        )

    # ── Step 5 — attempt budget (docs/05 §12.2).
    #
    # Checked only once cooling has expired, i.e. only on the branches that would
    # hand the candidate a NEW attempt. Ordering it earlier is wrong: a candidate
    # whose most recent result is a pass inside its carry-forward window would be
    # reported NOT_ELIGIBLE / MAX_ATTEMPTS_EXHAUSTED, blocking someone who already
    # passed. The budget caps retries; it does not invalidate a valid result.
    if max_attempts is not None and attempts_used >= max_attempts:
        return finish(**ctx, status="NOT_ELIGIBLE", reason="MAX_ATTEMPTS_EXHAUSTED",
                      show_button=False, prior_session_id=last["id"])

    return finish(
        **ctx, status="ELIGIBLE",
        reason="PRIOR_PASS_COOLING_EXPIRED" if passed else "PRIOR_FAIL_COOLING_EXPIRED",
        show_button=True, prior_session_id=last["id"],
    )
