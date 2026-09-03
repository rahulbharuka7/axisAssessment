"""Request and response contracts for the AI service."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class RubricDimension(BaseModel):
    """One behavioural indicator from the blueprint, used as a scoring dimension."""
    name: str
    max_score: float
    score: float
    evidence: str = Field(description="A supporting quote from the answer — a bare number is not reviewable")


class TextScoreRequest(BaseModel):
    competency: str
    definition: str
    behavioral_indicators: list[str]
    max_score: float = 20
    cutoff: float | None = None
    answer: str
    model_version: str = "rubric-llm-v3"


class TextScoreResponse(BaseModel):
    competency: str
    score: float
    max_score: float
    dimensions: list[RubricDimension]
    needs_human_review: bool
    review_reason: str | None = None
    model_version: str


class SpeechScoreRequest(BaseModel):
    competency: Literal["Pronunciation", "Fluency", "Grammar", "Listening Comprehension"]
    transcript: str = ""
    duration_ms: int = 0
    audio_ref: str | None = None
    model_version: str = "speechx-v1.4"


class SpeechScoreResponse(BaseModel):
    competency: str
    band: str
    score: float
    max_score: float
    signals: dict[str, float]
    model_version: str
    accent_penalty_applied: bool = False


class PersonalityItem(BaseModel):
    sub_competency: str
    value: int


class PersonalityRequest(BaseModel):
    instrument: Literal["MPM", "SJT"] = "MPM"
    norm_group: str = "sales_india_2026"
    items: list[PersonalityItem]
    model_version: str = "mpm-norms-2026.1"


class PersonalityResponse(BaseModel):
    instrument: str
    norm_group: str
    percentiles: dict[str, int]
    overall_band: str
    consistency_index: float
    social_desirability_index: float
    model_version: str


class ProctorEvent(BaseModel):
    flag_type: str
    started_at_ms: int
    duration_ms: int | None = None
    confidence: float = 1.0


class RiskRequest(BaseModel):
    events: list[ProctorEvent]
    weights: dict[str, float] | None = None
    bands: dict[str, float] | None = None


class RiskResponse(BaseModel):
    score: float
    band: Literal["low", "medium", "high"]
    contributions: list[dict[str, Any]]
    advisory_note: str
