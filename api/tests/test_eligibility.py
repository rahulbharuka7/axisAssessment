"""
The 22-case eligibility matrix from docs/05 §11, plus the API-surface cases.

These are the regression tests for the five gaps in §12 — in particular case 6,
which fails against the spec's original step ordering.
"""
from __future__ import annotations

import pytest

from api.app.db import connect, one, set_db, uuid
from api.app.errors import ApiError
from api.app.services.eligibility import evaluate_eligibility
from api.app.services.requirements import create_requirement
from api.app.services.settings import update_settings
from api.app.timeutil import iso_plus_days, iso_plus_minutes, now_iso

CAND = "cand-001"


def days_ago(n: int) -> str:
    return iso_plus_days(now_iso(), -n)


@pytest.fixture()
def db():
    conn = connect(":memory:")
    set_db(conn)
    conn.execute(
        """INSERT INTO tmext_ai_assessment_settings
             (id, role_id, cooling_period_pass_days, cooling_period_fail_days, max_attempts,
              score_policy, session_ttl_minutes, recording_retention_days,
              id_image_retention_days, answer_retention_days, result_visibility, updated_by, updated_at)
           VALUES ('settings-global', NULL, 180, 90, 2, 'best', 240, 90, 30, 730, 'basic', 'test', ?)""",
        (now_iso(),),
    )
    conn.execute("INSERT INTO tmext_job (role_id, role_name) VALUES (101, 'Retail Officer')")
    conn.execute("INSERT INTO tmext_job (role_id, role_name) VALUES (104, 'Sales Officer')")
    conn.commit()
    yield conn
    conn.close()


def add_session(db, status, outcome=None, scored_at=None, expires_at=None, role_id=101):
    sid = uuid()
    db.execute(
        """INSERT INTO tmext_ai_assessment_sessions
             (id, candidate_id, role_id, program_type, status, outcome, scored_at, expires_at,
              attempt_number, is_deleted, created_at, updated_at)
           VALUES (?, ?, ?, 'lateral', ?, ?, ?, ?, 1, 0, ?, ?)""",
        (sid, CAND, role_id, status, outcome, scored_at, expires_at, now_iso(), now_iso()),
    )
    db.commit()
    return sid


def ev(db, role_id=101, program="lateral"):
    return evaluate_eligibility(db, CAND, role_id, program, skip_audit=True)


def require101(db, required=True):
    return create_requirement(db, 101, "Retail Officer", "lateral", required, "admin")


# ── requirements resolution ─────────────────────────────────────────────────

def test_01_role_absent_is_not_applicable(db):
    r = ev(db)
    assert (r.status, r.reason, r.show_button) == ("NOT_APPLICABLE", "ROLE_NOT_REQUIRED", False)


def test_02_required_false_is_not_applicable(db):
    require101(db, required=False)
    assert ev(db).status == "NOT_APPLICABLE"


def test_03_exact_row_beats_wildcard(db):
    create_requirement(db, 104, "Sales Officer", None, False, "a")
    create_requirement(db, 104, "Sales Officer", "lateral", True, "a")
    assert ev(db, 104).status == "ELIGIBLE"                    # exact (true) wins
    assert ev(db, 104, "campus").status == "NOT_APPLICABLE"    # falls to wildcard (false)


def test_04_wildcard_applies_to_every_program(db):
    create_requirement(db, 104, "Sales Officer", None, True, "a")
    assert ev(db, 104).status == "ELIGIBLE"
    assert ev(db, 104, "campus").status == "ELIGIBLE"


def test_duplicate_rule_rejected(db):
    require101(db)
    with pytest.raises(ApiError) as exc:
        require101(db)
    assert exc.value.status == 409


# ── first attempt ───────────────────────────────────────────────────────────

def test_05_no_prior_session_is_eligible(db):
    require101(db)
    r = ev(db)
    assert (r.status, r.reason, r.show_button) == ("ELIGIBLE", "NO_PRIOR_RECORD", True)


# ── active session — docs/05 §12.1 ──────────────────────────────────────────

def test_06_in_progress_on_first_attempt_is_pending(db):
    """
    The regression test for the spec's live logic bug. Under the original step
    order (history before in-progress) this returns ELIGIBLE / NO_PRIOR_RECORD
    and the candidate is offered a second Start button mid-test.
    """
    require101(db)
    sid = add_session(db, "in_progress", expires_at=iso_plus_minutes(now_iso(), 120))
    r = ev(db)
    assert (r.status, r.reason, r.show_button) == ("PENDING", "ATTEMPT_IN_PROGRESS", False)
    assert r.prior_session_id == sid


def test_07_submitted_awaiting_scoring_is_pending(db):
    require101(db)
    add_session(db, "submitted")
    assert ev(db).reason == "ATTEMPT_IN_PROGRESS"


def test_07b_scoring_in_flight_is_pending(db):
    require101(db)
    add_session(db, "scoring")
    assert ev(db).reason == "ATTEMPT_IN_PROGRESS"


def test_08_expired_session_is_swept(db):
    require101(db)
    sid = add_session(db, "in_progress", expires_at=iso_plus_minutes(now_iso(), -5))
    r = ev(db)
    assert (r.status, r.reason) == ("ELIGIBLE", "NO_PRIOR_RECORD")
    assert one(db, "SELECT status FROM tmext_ai_assessment_sessions WHERE id = ?", (sid,))["status"] == "expired"


# ── cooling — docs/05 §12.3 ─────────────────────────────────────────────────

def test_09_prior_pass_in_cooling_is_skip(db):
    require101(db)
    sid = add_session(db, "scored", "pass", days_ago(30))
    r = ev(db)
    assert (r.status, r.reason, r.show_button) == ("SKIP", "PRIOR_PASS_IN_COOLING", False)
    assert r.prior_session_id == sid and r.cooling_ends_at is not None


def test_10_prior_pass_cooling_expired_is_eligible(db):
    require101(db)
    add_session(db, "scored", "pass", days_ago(200))
    r = ev(db)
    assert (r.status, r.reason) == ("ELIGIBLE", "PRIOR_PASS_COOLING_EXPIRED")


def test_11_prior_fail_in_cooling_is_pending_cooling(db):
    require101(db)
    add_session(db, "scored", "fail", days_ago(10))
    r = ev(db)
    assert (r.status, r.reason, r.show_button) == ("PENDING_COOLING", "PRIOR_FAIL_IN_COOLING", False)


def test_12_prior_fail_cooling_expired_is_eligible(db):
    require101(db)
    add_session(db, "scored", "fail", days_ago(120))
    r = ev(db)
    assert (r.status, r.reason) == ("ELIGIBLE", "PRIOR_FAIL_COOLING_EXPIRED")


def test_pass_and_fail_windows_are_independent(db):
    """120 days is past the 90-day fail lockout but inside the 180-day pass validity."""
    require101(db)
    add_session(db, "scored", "fail", days_ago(120))
    assert ev(db).status == "ELIGIBLE"


def test_pass_window_still_active_at_120_days(db):
    require101(db)
    add_session(db, "scored", "pass", days_ago(120))
    assert ev(db).status == "SKIP"


# ── attempt budget — docs/05 §12.2 ──────────────────────────────────────────

def test_13_attempts_spent_is_not_eligible(db):
    require101(db)
    add_session(db, "scored", "fail", days_ago(300))
    add_session(db, "scored", "fail", days_ago(200))
    r = ev(db)
    assert (r.status, r.reason) == ("NOT_ELIGIBLE", "MAX_ATTEMPTS_EXHAUSTED")
    assert (r.attempts_used, r.max_attempts) == (2, 2)


def test_14_recruiter_grant_reopens_budget(db):
    require101(db)
    add_session(db, "scored", "fail", days_ago(300))
    add_session(db, "scored", "fail", days_ago(200))
    assert ev(db).status == "NOT_ELIGIBLE"

    db.execute(
        """INSERT INTO tmext_ai_attempt_grant
             (id, candidate_id, role_id, reason, granted_by, is_deleted, created_at)
           VALUES (?, ?, 101, 'Power cut mid-test, verified', 'rec-1', 0, ?)""",
        (uuid(), CAND, now_iso()),
    )
    db.commit()
    r = ev(db)
    assert (r.status, r.reason, r.max_attempts) == ("ELIGIBLE", "PRIOR_FAIL_COOLING_EXPIRED", 3)


def test_valid_pass_in_cooling_never_blocked_by_spent_budget(db):
    """
    Regression: the budget caps retries, it must not invalidate a pass the
    candidate already earned. Ordering the check before cooling returned
    NOT_ELIGIBLE for someone who had passed 10 days ago.
    """
    require101(db)
    add_session(db, "scored", "fail", days_ago(300))
    add_session(db, "scored", "pass", days_ago(10))
    r = ev(db)
    assert (r.attempts_used, r.max_attempts) == (2, 2)
    assert r.status == "SKIP"


def test_fail_in_cooling_reports_cooling_not_budget(db):
    require101(db)
    add_session(db, "scored", "fail", days_ago(300))
    add_session(db, "scored", "fail", days_ago(10))
    r = ev(db)
    assert r.status == "PENDING_COOLING" and r.cooling_ends_at is not None


def test_22_null_max_attempts_is_unlimited(db):
    require101(db)
    update_settings(db, None, {"max_attempts": None}, "admin")
    for d in (300, 200, 150):
        add_session(db, "scored", "fail", days_ago(d))
    r = ev(db)
    assert r.status == "ELIGIBLE" and r.max_attempts is None


# ── history selection ───────────────────────────────────────────────────────

def test_15_most_recent_scored_session_drives_decision(db):
    require101(db)
    add_session(db, "scored", "fail", days_ago(300))
    recent = add_session(db, "scored", "pass", days_ago(10))
    r = ev(db)
    assert r.status == "SKIP" and r.prior_session_id == recent


def test_16_other_role_session_ignored(db):
    require101(db)
    add_session(db, "scored", "pass", days_ago(10), role_id=999)
    r = ev(db)
    assert (r.status, r.reason) == ("ELIGIBLE", "NO_PRIOR_RECORD")


def test_21_inconclusive_outcome_is_not_a_free_pass(db):
    require101(db)
    add_session(db, "scored", "inconclusive", days_ago(10))
    r = ev(db)
    assert r.status == "PENDING_COOLING" and r.show_button is False


# ── settings ────────────────────────────────────────────────────────────────

def test_20_missing_settings_fail_closed(db):
    require101(db)
    db.execute("DELETE FROM tmext_ai_assessment_settings")
    db.commit()
    with pytest.raises(ApiError) as exc:
        ev(db)
    assert (exc.value.status, exc.value.code) == (503, "SETTINGS_UNAVAILABLE")


def test_role_override_beats_global(db):
    require101(db)
    update_settings(db, 101, {"cooling_period_fail_days": 5}, "admin")
    add_session(db, "scored", "fail", days_ago(10))
    assert ev(db).status == "ELIGIBLE"   # 10 days > the 5-day override


# ── response shape ──────────────────────────────────────────────────────────

def test_additive_response_fields(db):
    require101(db)
    r = ev(db)
    assert r.role_id == 101 and r.role_name == "Retail Officer"
    assert r.program_type == "lateral"
    assert (r.attempts_used, r.max_attempts) == (0, 2)
    assert r.evaluated_at.endswith("Z")
    assert hasattr(r, "blueprint_id") and hasattr(r, "estimated_duration_minutes")


def test_every_evaluation_is_audited(db):
    require101(db)
    evaluate_eligibility(db, CAND, 101, "lateral")
    n = one(db, "SELECT COUNT(*) AS n FROM tmext_ai_assessment_audit WHERE action = 'eligibility.evaluate'")
    assert n["n"] == 1
