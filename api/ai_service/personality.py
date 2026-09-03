"""
MPM and SJT scoring — docs/08 §5.4.

Norm-referenced, never AI-generated free scoring. Psychometrics run on published
instruments and norm tables; this is the one place an LLM is not in the loop.
Output is a percentile and a fit band, never a pass/fail.
"""
from __future__ import annotations

import statistics

from .models import PersonalityRequest, PersonalityResponse

# Norm table stand-in: mean and SD per sub-competency for the norm group.
# In production these are supplied by the psychometrician, versioned per group.
NORMS: dict[str, tuple[float, float]] = {
    "Self-control": (3.4, 0.8),
    "Self-confidence": (3.6, 0.7),
    "Stress Tolerance": (3.3, 0.9),
    "Result Orientation": (3.8, 0.7),
    "Taking Initiatives": (3.5, 0.8),
    "Information Seeking": (3.4, 0.8),
    "Problem Solving": (3.6, 0.7),
    "Empathy": (3.7, 0.8),
    "Networking with People": (3.3, 0.9),
    "Influencing Others": (3.5, 0.8),
    "Customer Service Orientation": (3.9, 0.6),
}

DEFAULT_NORM = (3.5, 0.8)


def _percentile(value: float, mean: float, sd: float) -> int:
    """Normal-approximation percentile via the logistic CDF — no scipy needed."""
    z = (value - mean) / (sd or 1)
    cdf = 1 / (1 + pow(2.718281828, -1.702 * z))
    return max(1, min(99, round(cdf * 100)))


def score_personality(req: PersonalityRequest) -> PersonalityResponse:
    grouped: dict[str, list[int]] = {}
    for item in req.items:
        grouped.setdefault(item.sub_competency, []).append(item.value)

    percentiles: dict[str, int] = {}
    for sub, values in grouped.items():
        mean, sd = NORMS.get(sub, DEFAULT_NORM)
        percentiles[sub] = _percentile(statistics.fmean(values), mean, sd)

    overall = round(statistics.fmean(percentiles.values())) if percentiles else 50
    band = "Strong fit" if overall >= 70 else "Fit" if overall >= 40 else "Development area"

    all_values = [i.value for i in req.items]
    # A flat response set means the candidate answered without discriminating —
    # low consistency signal, surfaced to the recruiter rather than scored away.
    consistency = round(statistics.pstdev(all_values) if len(all_values) > 1 else 0.0, 3)
    # A perfectly desirable response set is itself information.
    extremes = sum(1 for v in all_values if v >= 5) / max(len(all_values), 1)

    return PersonalityResponse(
        instrument=req.instrument,
        norm_group=req.norm_group,
        percentiles=percentiles,
        overall_band=band,
        consistency_index=consistency,
        social_desirability_index=round(extremes, 3),
        model_version=req.model_version,
    )
