"""
Proctoring risk aggregation — docs/08 §3.

risk = Σ (weight × confidence × duration_factor), clamped 0–100.

A High band never blocks a result. It orders the review queue; a recruiter
always decides. Every response carries that statement so no consumer can treat
the number as a verdict.
"""
from __future__ import annotations

from .models import RiskRequest, RiskResponse

DEFAULT_WEIGHTS: dict[str, float] = {
    "FACE_MISMATCH": 25,
    "MULTI_FACE": 25,
    "FACE_ABSENT": 15,
    "TAB_SWITCH": 15,
    "COPY_PASTE": 10,
    "SECOND_DEVICE": 10,
    "FULLSCREEN_EXIT": 10,
    "EXTRA_VOICE": 15,
    "TIMING_ANOMALY": 10,
}

DEFAULT_BANDS = {"medium": 30.0, "high": 70.0}

# Every check has a minimum duration before it counts. A face missing for 400ms
# is someone scratching their nose, not absence. docs/08 §2.
MIN_DURATION_MS: dict[str, int] = {
    "FACE_ABSENT": 3000,
    "MULTI_FACE": 2000,
    "EXTRA_VOICE": 3000,
    "SECOND_DEVICE": 2000,
}

ADVISORY = (
    "Advisory only. This score orders the review queue and never blocks a result — "
    "a recruiter always makes the final decision."
)


def compute_risk(req: RiskRequest) -> RiskResponse:
    weights = {**DEFAULT_WEIGHTS, **(req.weights or {})}
    bands = {**DEFAULT_BANDS, **(req.bands or {})}

    total = 0.0
    contributions: list[dict[str, object]] = []

    for e in req.events:
        floor = MIN_DURATION_MS.get(e.flag_type, 0)
        if floor and (e.duration_ms or 0) < floor:
            contributions.append({
                "flag_type": e.flag_type, "contribution": 0.0,
                "suppressed": True,
                "why": f"below the {floor}ms minimum duration for this check",
            })
            continue

        weight = weights.get(e.flag_type, 5.0)
        # Sustained events count for more, but saturate — a 10-minute absence is
        # not 20x worse than a 30-second one for ordering a review queue.
        duration_factor = min(2.0, 1 + (e.duration_ms or 0) / 120_000)
        value = weight * e.confidence * duration_factor
        total += value
        contributions.append({
            "flag_type": e.flag_type,
            "contribution": round(value, 2),
            "suppressed": False,
            "weight": weight,
            "confidence": e.confidence,
            "duration_factor": round(duration_factor, 2),
        })

    score = min(100.0, round(total, 1))
    band = "high" if score >= bands["high"] else "medium" if score >= bands["medium"] else "low"

    return RiskResponse(score=score, band=band, contributions=contributions, advisory_note=ADVISORY)
