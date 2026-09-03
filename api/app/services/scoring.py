"""
Scoring — objective marking here, AI stages delegated to the AI service (docs/08).

Objective items are keyed synchronously. AI-scored items (WRITING, SPEECHX, MPM)
carry a NULL answer_key; those are dispatched to the AI service and, until it
returns, are excluded from the achievable maximum so a partially-scored session
never reads as a low one.
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any

import httpx

from ..audit import audit
from ..config import AI_SERVICE_TIMEOUT, AI_SERVICE_URL
from ..db import many, one, run
from ..timeutil import now_iso
from .sessions import get_session


def compute_risk(conn: sqlite3.Connection, session_id: str) -> dict[str, Any]:
    """
    Delegates to the AI service, falling back to a local aggregation if it is
    unreachable. A scoring outage must not leave a submitted session unscored —
    the fallback is marked so a recruiter knows which produced the number.
    """
    flags = many(
        conn,
        """SELECT flag_type, confidence, duration_ms, review_verdict
             FROM tmext_ai_proctor_flag WHERE session_id = ?""",
        (session_id,),
    )
    # Flags a recruiter has marked false_positive are excluded, so a corrected
    # session's risk reflects the human verdict rather than re-asserting the model's.
    events = [
        {
            "flag_type": f["flag_type"],
            "started_at_ms": 0,
            "duration_ms": f["duration_ms"],
            "confidence": f["confidence"] if f["confidence"] is not None else 1.0,
        }
        for f in flags
        if f["review_verdict"] != "false_positive"
    ]

    if not events:
        return {"score": 0.0, "band": "low", "source": "local"}

    try:
        res = httpx.post(
            f"{AI_SERVICE_URL}/proctoring/risk",
            json={"events": events},
            timeout=AI_SERVICE_TIMEOUT,
        )
        res.raise_for_status()
        data = res.json()["data"]
        return {"score": data["score"], "band": data["band"], "source": "ai_service"}
    except Exception:  # noqa: BLE001 — degrade, never block a submission
        weights = {
            "FACE_MISMATCH": 25, "MULTI_FACE": 25, "FACE_ABSENT": 15, "TAB_SWITCH": 15,
            "COPY_PASTE": 10, "SECOND_DEVICE": 10, "FULLSCREEN_EXIT": 10,
            "EXTRA_VOICE": 15, "TIMING_ANOMALY": 10,
        }
        total = sum(
            weights.get(e["flag_type"], 5)
            * e["confidence"]
            * min(2.0, 1 + (e["duration_ms"] or 0) / 120_000)
            for e in events
        )
        score = min(100.0, round(total, 1))
        band = "high" if score >= 70 else "medium" if score >= 30 else "low"
        return {"score": score, "band": band, "source": "local_fallback"}


def _ai_jobs(conn: sqlite3.Connection, session: dict[str, Any]) -> list[dict[str, Any]]:
    """Build the AI-service job list from the blueprint's own competency definitions."""
    rows = many(
        conn,
        """SELECT q.question_type, q.tool, c.name AS competency, c.definition,
                  c.behavioral_indicators, s.cutoff_score, q.marks_correct, a.value AS answer
             FROM tmext_ai_test_question tq
             JOIN tmext_ai_question q          ON q.id = tq.question_id
             JOIN tmext_ai_competency c        ON c.id = q.competency_id
             JOIN tmext_ai_blueprint_section s ON s.id = tq.section_id
             LEFT JOIN tmext_ai_answer a       ON a.session_id = ? AND a.question_id = q.id
            WHERE tq.test_id = ? AND q.answer_key IS NULL AND a.value IS NOT NULL""",
        (session["id"], session["test_id"]),
    )

    jobs: list[dict[str, Any]] = []
    likert: list[dict[str, Any]] = []

    for r in rows:
        answer = json.loads(r["answer"]) if r["answer"] else None
        if r["question_type"] == "LONG_TEXT" and isinstance(answer, str):
            jobs.append({
                "kind": "text",
                "payload": {
                    "competency": r["competency"],
                    "definition": r["definition"] or "",
                    # The blueprint IS the rubric — its indicators become dimensions.
                    "behavioral_indicators": json.loads(r["behavioral_indicators"] or "[]"),
                    "max_score": r["marks_correct"],
                    "cutoff": r["cutoff_score"],
                    "answer": answer,
                },
            })
        elif r["question_type"] == "AUDIO_RESPONSE":
            jobs.append({
                "kind": "speech",
                "payload": {
                    "competency": r["competency"],
                    "transcript": (answer or {}).get("transcript", "") if isinstance(answer, dict) else "",
                    "duration_ms": (answer or {}).get("duration_ms", 0) if isinstance(answer, dict) else 0,
                },
            })
        elif r["question_type"] == "LIKERT":
            idx = int(str(answer).replace("o", "")) + 1 if isinstance(answer, str) and answer.startswith("o") else 3
            likert.append({"sub_competency": r["competency"], "value": idx})

    if likert:
        jobs.append({"kind": "personality", "payload": {"instrument": "MPM", "items": likert}})
    return jobs


def run_ai_pipeline(conn: sqlite3.Connection, session: dict[str, Any]) -> dict[str, Any] | None:
    """Dispatch every AI stage for the session. Returns None if the service is down."""
    jobs = _ai_jobs(conn, session)
    flags = many(
        conn,
        "SELECT flag_type, started_at_ms, duration_ms, confidence FROM tmext_ai_proctor_flag WHERE session_id = ?",
        (session["id"],),
    )
    try:
        res = httpx.post(
            f"{AI_SERVICE_URL}/pipeline/run",
            json={
                "session_id": session["id"],
                "jobs": jobs,
                "events": [
                    {
                        "flag_type": f["flag_type"],
                        "started_at_ms": f["started_at_ms"],
                        "duration_ms": f["duration_ms"],
                        "confidence": f["confidence"] if f["confidence"] is not None else 1.0,
                    }
                    for f in flags
                ],
            },
            timeout=AI_SERVICE_TIMEOUT,
        )
        res.raise_for_status()
        return res.json()["data"]
    except Exception:  # noqa: BLE001
        return None


def score_session(
    conn: sqlite3.Connection, session_id: str, *, request_id: str | None = None
) -> dict[str, Any]:
    session = get_session(conn, session_id)
    if session["status"] == "scored":
        return session

    rows = many(
        conn,
        """SELECT q.id, q.answer_key, q.marks_correct, q.marks_wrong,
                  c.name AS competency, s.id AS section_id, s.tool, s.cutoff_score,
                  a.value AS answer
             FROM tmext_ai_test_question tq
             JOIN tmext_ai_question q          ON q.id = tq.question_id
             JOIN tmext_ai_competency c        ON c.id = q.competency_id
             JOIN tmext_ai_blueprint_section s ON s.id = tq.section_id
             LEFT JOIN tmext_ai_answer a       ON a.session_id = ? AND a.question_id = q.id
            WHERE tq.test_id = ?""",
        (session_id, session["test_id"]),
    )

    sections: dict[str, dict[str, Any]] = {}
    total = 0.0
    max_score = 0.0

    for r in rows:
        sec = sections.setdefault(
            r["section_id"],
            {
                "section_id": r["section_id"], "competency": r["competency"], "tool": r["tool"],
                "score": 0.0, "max": 0.0, "cutoff": r["cutoff_score"], "passed": None,
            },
        )
        if not r["answer_key"]:
            continue  # AI-scored; excluded until the pipeline returns

        sec["max"] += r["marks_correct"]
        max_score += r["marks_correct"]
        if r["answer"] is None:
            continue

        correct = json.loads(r["answer_key"]) == json.loads(r["answer"])
        delta = r["marks_correct"] if correct else -abs(r["marks_wrong"])
        sec["score"] += delta
        total += delta

    for sec in sections.values():
        sec["score"] = max(0.0, round(sec["score"], 2))
        if sec["cutoff"] is not None and sec["max"] > 0:
            sec["passed"] = sec["score"] >= sec["cutoff"]

    total = max(0.0, round(total, 2))

    # AI stages — recorded on the section rows so the recruiter sees which are
    # scored, which are queued, and which need a human.
    ai = run_ai_pipeline(conn, session)
    ai_summary: dict[str, Any] = {"dispatched": bool(ai)}
    if ai:
        ai_summary |= {
            "elapsed_ms": ai["elapsed_ms"],
            "within_budget": ai["within_budget"],
            "complete": ai["complete"],
            "needs_manual_review": ai["needs_manual_review"],
            "models": ai["models"],
        }
        for item in ai["sections"]:
            if not item.get("ok"):
                continue
            result = item["result"]

            if item["kind"] == "personality":
                # Norm-referenced: percentiles are keyed by competency, and the
                # result carries no `competency` field of its own. Attach the
                # percentile and the fit band — never a pass/fail (docs/08 §5.4).
                for competency, percentile in result["percentiles"].items():
                    for sec in sections.values():
                        if sec["competency"] == competency and sec["max"] == 0:
                            sec["score"] = float(percentile)
                            sec["max"] = 100.0
                            sec["ai_scored"] = True
                            sec["scale"] = "percentile"
                            sec["band"] = result["overall_band"]
                            sec["model_version"] = result["model_version"]
                            sec["consistency_index"] = result["consistency_index"]
                            sec["social_desirability_index"] = result["social_desirability_index"]
                continue

            for sec in sections.values():
                if sec["competency"] == result.get("competency") and sec["max"] == 0:
                    sec["score"] = result["score"]
                    sec["max"] = result["max_score"]
                    sec["ai_scored"] = True
                    sec["model_version"] = result["model_version"]
                    if result.get("needs_human_review"):
                        sec["needs_human_review"] = True
                        sec["review_reason"] = result.get("review_reason")
                    if sec["cutoff"] is not None:
                        sec["passed"] = sec["score"] >= sec["cutoff"]

    test = one(
        conn,
        "SELECT overall_cutoff, enforce_section_cutoffs FROM tmext_ai_test WHERE id = ?",
        (session["test_id"],),
    )
    pct = (total / max_score * 100) if max_score > 0 else 0.0
    overall_ok = not test or test["overall_cutoff"] is None or pct >= test["overall_cutoff"]
    sections_ok = (
        not test or test["enforce_section_cutoffs"] != 1
        or all(s["passed"] is not False for s in sections.values())
    )
    outcome = "pass" if (overall_ok and sections_ok) else "fail"

    risk = compute_risk(conn, session_id)
    ts = now_iso()

    run(
        conn,
        """UPDATE tmext_ai_assessment_sessions
              SET status = 'scored', outcome = ?, total_score = ?, max_score = ?,
                  section_scores = ?, risk_score = ?, risk_band = ?,
                  scored_at = ?, updated_at = ?
            WHERE id = ?""",
        (outcome, total, max_score, json.dumps(list(sections.values())),
         risk["score"], risk["band"], ts, ts, session_id),
    )

    audit(
        conn, actor_type="system", action="session.score",
        entity_type="session", entity_id=session_id,
        after={"outcome": outcome, "total": total, "max": max_score,
               "risk_band": risk["band"], "risk_source": risk["source"], "ai": ai_summary},
        request_id=request_id,
    )
    return get_session(conn, session_id)
