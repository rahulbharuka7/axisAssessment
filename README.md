# Axis Bank — AI Assessment Module

Planning repository for a proctored, AI-scored candidate assessment module embedded in
ThriveHR's ATS.

- **Functional reference:** Mercer Mettl
- **Visual reference:** Axis Bank Burgundy
- **Personas:** TA-Admin · Recruiter · Candidate

---

## Start Here

| Doc | What it covers |
|---|---|
| [00 — Overview](docs/00-OVERVIEW.md) | Scope, architecture, Mettl parity map, success criteria |
| [01 — Blueprint Model](docs/01-BLUEPRINT-MODEL.md) | Competency/blueprint data model from the 3 spreadsheets |
| [02 — Persona: Admin](docs/02-PERSONA-ADMIN.md) | Governance, requirements config, policy, thresholds |
| [03 — Persona: Recruiter](docs/03-PERSONA-RECRUITER.md) | Test authoring, dashboard, review, decisioning |
| [04 — Persona: Candidate](docs/04-PERSONA-CANDIDATE.md) | Eligibility, system check, test runtime, results |
| [05 — Eligibility API](docs/05-API-ELIGIBILITY.md) | **The eligibility API**, generated per the attached spec |
| [06 — API Surface](docs/06-API-SURFACE.md) | Full endpoint list across all three personas |
| [07 — Design System](docs/07-DESIGN-SYSTEM-AXIS.md) | Axis Burgundy tokens, components, accessibility |
| [08 — AI & Proctoring](docs/08-AI-PROCTORING.md) | Proctoring pipeline, scoring engine, model governance |
| [09 — Roadmap](docs/09-ROADMAP.md) | Phased delivery, team, risks, open questions |

---

## Source Attachments

The plan is derived from five business documents in the repository root:

| File | Contributes |
|---|---|
| `AI_Assessment_Module_Plan.txt` | Module scope, test flow, recruiter setup screen, proctoring toggles, retake rules |
| `ASSESSMENT_ELIGIBILITY.md` | Eligibility API contract, `tmext_*` tables, ATS handshake |
| `Copy of Mercer Mettl_Blueprint_Sample2.xlsx` | Cognitive + Written English + SpeechX blueprint |
| `Copy of Mercer Mettl_Blueprint_Sample3.xlsx` | SpeechX standalone (72 q / 45 min) |
| `SampleAssessment_Blueprint.xlsx` | Sales Personality — MPM + Situational Judgement |

> The `... (1).xlsx` files are byte-identical duplicates of Sample2 and SampleAssessment.

---

## The Shape of It

```
Blueprint  ──authored by──▶  ADMIN
    │ instantiated as
    ▼
Test       ──configured by──▶  RECRUITER
    │ invited to
    ▼
Session    ──attempted by──▶  CANDIDATE
    │ produces
    ▼
Report     ──reviewed by──▶  RECRUITER  ──audited by──▶  ADMIN
    │ outcome feeds
    ▼
Eligibility (next application)  ──consumed by──▶  ATS
```

The session outcome is the input to the next eligibility decision. That loop is why
[doc 05](docs/05-API-ELIGIBILITY.md) is the spine of the module rather than a peripheral
endpoint.

---

## Two Things That Need a Decision

1. **The eligibility spec has a reachability bug.** Its Step 2 (history) runs before Step 3
   (in-progress), so a first-time candidate who is mid-test returns
   `ELIGIBLE / NO_PRIOR_RECORD` and is offered a second Start button. Fix and reasoning in
   [doc 05 §12.1](docs/05-API-ELIGIBILITY.md). Four further gaps are documented alongside it.

2. **The SpeechX blueprint does not add up.** The header declares 72 questions; the four
   competency rows sum to 64, with an unlabelled `8` sitting under Pronunciation. The
   blueprint cannot be published until those 8 are attributed —
   [doc 01 §5](docs/01-BLUEPRINT-MODEL.md).

Nine open questions for the business are collected in
[doc 09](docs/09-ROADMAP.md#open-questions-for-the-business).
