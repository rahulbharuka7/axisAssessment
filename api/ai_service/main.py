"""
Axis Assessment — AI service (docs/08).

Runs as its own process so scoring scales independently of the request path and
a slow model never blocks a candidate's autosave. Every response carries the
model version that produced it: an assessment scored in March must be
reproducible in September, and two candidates in one requisition must be
comparable.
"""
from __future__ import annotations

import time
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .models import (
    PersonalityRequest, PersonalityResponse,
    RiskRequest, RiskResponse,
    SpeechScoreRequest, SpeechScoreResponse,
    TextScoreRequest, TextScoreResponse,
)
from .personality import score_personality
from .proctoring import compute_risk
from .rubric import score_text
from .speech import score_speech

app = FastAPI(title="Axis Assessment — AI Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Pinned, not floating. A silently upgraded model makes two candidates in the
# same requisition incomparable and past decisions unreconstructable.
MODEL_PINS = {
    "text_rubric": "rubric-llm-v3",
    "speech": "speechx-v1.4",
    "personality": "mpm-norms-2026.1",
    "face": "face-v2.3",
}


def ok(data: Any) -> dict[str, Any]:
    return {"success": True, "data": data}


@app.get("/health")
def health() -> dict[str, Any]:
    return ok({"status": "ok", "models": MODEL_PINS})


@app.get("/models")
def models() -> dict[str, Any]:
    """Model pins, so the API can record which version produced each score."""
    return ok({"pinned": MODEL_PINS, "advisory": "AI output never blocks a result"})


@app.post("/score/text")
def text(req: TextScoreRequest) -> dict[str, Any]:
    """Score a written answer against the blueprint's behavioural indicators."""
    return ok(score_text(req).model_dump())


@app.post("/score/speech")
def speech(req: SpeechScoreRequest) -> dict[str, Any]:
    return ok(score_speech(req).model_dump())


@app.post("/score/personality")
def personality(req: PersonalityRequest) -> dict[str, Any]:
    return ok(score_personality(req).model_dump())


@app.post("/proctoring/risk")
def risk(req: RiskRequest) -> dict[str, Any]:
    return ok(compute_risk(req).model_dump())


class SectionJob(BaseModel):
    kind: str                       # text | speech | personality
    payload: dict[str, Any]


class PipelineRequest(BaseModel):
    session_id: str
    jobs: list[SectionJob] = []
    events: list[dict[str, Any]] = []


@app.post("/pipeline/run")
def pipeline(req: PipelineRequest) -> dict[str, Any]:
    """
    Run every AI stage for one session and report the time budget (docs/08 §6).

    A stage that fails does not fail the report: its section is returned marked
    for manual review and the recruiter is told which. A candidate's result must
    never be silently incomplete.
    """
    started = time.perf_counter()
    results: list[dict[str, Any]] = []

    for job in req.jobs:
        try:
            if job.kind == "text":
                results.append({"kind": "text", "ok": True,
                                "result": score_text(TextScoreRequest(**job.payload)).model_dump()})
            elif job.kind == "speech":
                results.append({"kind": "speech", "ok": True,
                                "result": score_speech(SpeechScoreRequest(**job.payload)).model_dump()})
            elif job.kind == "personality":
                results.append({"kind": "personality", "ok": True,
                                "result": score_personality(PersonalityRequest(**job.payload)).model_dump()})
            else:
                results.append({"kind": job.kind, "ok": False,
                                "error": f"unknown job kind '{job.kind}'",
                                "status": "manual_review_required"})
        except Exception as exc:  # noqa: BLE001 — a bad stage must not sink the report
            results.append({"kind": job.kind, "ok": False, "error": str(exc),
                            "status": "manual_review_required"})

    risk_result = compute_risk(
        RiskRequest(events=[e for e in req.events])  # type: ignore[arg-type]
    ).model_dump() if req.events else None

    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    failed = [r for r in results if not r["ok"]]

    return ok({
        "session_id": req.session_id,
        "sections": results,
        "risk": risk_result,
        "elapsed_ms": elapsed_ms,
        "within_budget": elapsed_ms < 300_000,   # the <5 min target in docs/08 §6
        "complete": not failed,
        "needs_manual_review": [r["kind"] for r in failed],
        "models": MODEL_PINS,
    })
