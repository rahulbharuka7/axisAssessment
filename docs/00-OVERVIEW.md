# Axis Bank — AI Assessment Module
## Master Plan & Overview

**Platform:** ThriveHR
**Functional reference:** Mercer Mettl
**Visual reference:** Axis Bank Burgundy
**Status:** Planning — v1.0

---

## 1. What We Are Building

A proctored, AI-scored assessment module embedded inside ThriveHR's existing ATS. When a
candidate reaches **Shortlisted**, the ATS asks the assessment module whether an assessment
is required. If yes, the candidate takes a blueprint-driven, AI-proctored test; the module
scores it, produces a risk-rated report, and hands the outcome back to the recruiter's
pipeline.

The module is **advisory, never terminal**. AI flags and AI scores are decision support.
A human recruiter always makes the final call.

---

## 2. Source Documents

This plan is derived from five attachments supplied by the business:

| # | Attachment | What it defines |
|---|---|---|
| 1 | `AI_Assessment_Module_Plan.txt` | Module scope, candidate test flow, recruiter test-setup screen, proctoring toggles, retake rules |
| 2 | `ASSESSMENT_ELIGIBILITY.md` | Eligibility API contract, `tmext_*` tables, ATS handshake, status matrix |
| 3 | `Copy of Mercer Mettl_Blueprint_Sample2.xlsx` | Cognitive Ability + Written English + SpeechX blueprint, with difficulty split, duration and cutoff |
| 4 | `Copy of Mercer Mettl_Blueprint_Sample3.xlsx` | SpeechX standalone blueprint (72 questions / 45 mins) |
| 5 | `SampleAssessment_Blueprint.xlsx` | Sales Personality blueprint — MPM + Situational Judgement, 3 meta-competencies |

> Two of the seven uploaded files are byte-identical duplicates
> (`... (1).xlsx` copies of Sample2 and SampleAssessment). Five unique documents.

---

## 3. Document Map

| Doc | Covers |
|---|---|
| `00-OVERVIEW.md` | This document — scope, architecture, success criteria |
| `01-BLUEPRINT-MODEL.md` | The competency/blueprint data model extracted from the 3 spreadsheets |
| `02-PERSONA-ADMIN.md` | TA-Admin — governance, requirements config, settings, question bank |
| `03-PERSONA-RECRUITER.md` | Recruiter — test authoring, invigilation, review, decisioning |
| `04-PERSONA-CANDIDATE.md` | Candidate — eligibility, system check, test taking, results |
| `05-API-ELIGIBILITY.md` | **The eligibility API**, generated per the attached spec |
| `06-API-SURFACE.md` | Full API surface across all three personas |
| `07-DESIGN-SYSTEM-AXIS.md` | Axis Burgundy design tokens, components, screen specs |
| `08-AI-PROCTORING.md` | Proctoring pipeline + AI scoring engine |
| `09-ROADMAP.md` | Phased delivery, team, risks |

---

## 4. The Three Personas

The module has exactly three human personas. Every screen, API and permission in this plan
maps to one of them.

```
┌──────────────────────────────────────────────────────────────────────┐
│  TA-ADMIN            │  RECRUITER            │  CANDIDATE            │
│  "Set the rules"     │  "Run the hiring"     │  "Take the test"      │
├──────────────────────┼───────────────────────┼───────────────────────┤
│ Which roles need an  │ Build the test from   │ Am I eligible?        │
│ assessment           │ a blueprint           │                       │
│                      │                       │ System + ID check     │
│ Cooling periods,     │ Invite candidates     │                       │
│ retention, attempts  │                       │ Take the test under   │
│                      │ Watch the live board  │ proctoring            │
│ Question bank &      │                       │                       │
│ blueprint governance │ Review flags, override│ See my outcome        │
│                      │ AI, decide            │                       │
│ Audit, compliance,   │                       │ Request a retake      │
│ AI model thresholds  │ Push result to ATS    │                       │
└──────────────────────┴───────────────────────┴───────────────────────┘
```

**Persona blend.** The three journeys are not three products. They are one object graph
seen from three angles:

```
        Blueprint  ──authored by──▶  ADMIN
            │
            │ instantiated as
            ▼
        Test/Assessment  ──configured by──▶  RECRUITER
            │
            │ invited to
            ▼
        Session  ──attempted by──▶  CANDIDATE
            │
            │ produces
            ▼
        Report  ──reviewed by──▶  RECRUITER  ──audited by──▶  ADMIN
            │
            │ outcome feeds
            ▼
        Eligibility (next application)  ──consumed by──▶  ATS
```

The **Session outcome closes the loop**: it is the input to the eligibility decision the
next time that candidate applies. This is why the eligibility API (doc 05) is the spine of
the module and not a peripheral endpoint.

---

## 5. Functional Parity Map — Mettl → Axis

Mettl is the functional benchmark. This is what we take, what we skip, and what we add.

| Mettl capability | Axis module | Notes |
|---|---|---|
| Test authoring + section builder | ✅ Build | Blueprint-driven, not free-form |
| Question bank / library | ✅ Build | Seeded from the 3 supplied blueprints |
| Bulk question upload (Excel) | ✅ Build | Ingests the exact blueprint sheet layout |
| MCQ, short answer, long answer | ✅ Build | Per attachment 1 |
| Image-in-question / image-in-answer | ✅ Build | Explicitly required by attachment 1 |
| Psychometric / personality (MPM) | ✅ Build | Sales Personality blueprint |
| Situational Judgement Tests | ✅ Build | Listed as a Tool in the blueprint |
| Spoken English (SpeechX) | ✅ Build | 4 competencies, audio capture + speech AI |
| Coding simulators / IDE | ⚠️ Phase 4 | Named in attachment 1 but no blueprint supplied |
| AI proctoring (face, multi-person) | ✅ Build | Core requirement |
| Live human proctoring | ❌ Skip v1 | Record-and-review is sufficient per attachment 1 |
| Tab-switch / copy-paste / fullscreen | ✅ Build | Explicit toggles required |
| Second-device / phone detection | ✅ Build | Explicit toggle required |
| Session recording + timestamped flags | ✅ Build | Reviewer jumps to the moment |
| Recruiter dashboard + filters | ✅ Build | Sort by score, risk, role |
| Auto-scoring of written answers | ✅ Build | Against blueprint competencies |
| ATS integration | ✅ Build | Eligibility API is the contract |
| Public test marketplace | ❌ Skip | Not applicable to internal bank hiring |
| **Axis addition:** cooling-period carry-forward | ➕ New | Not a Mettl concept — from attachment 2 |
| **Axis addition:** blueprint-cutoff scoring | ➕ New | Per-section cutoffs from the spreadsheets |

---

## 6. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENTS                                    │
│  Candidate SPA        Recruiter Console       Admin Console         │
│  (React, locked-down) (React)                 (React)               │
└───────────┬───────────────────┬───────────────────┬─────────────────┘
            │                   │                   │
            ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     API GATEWAY  (JWT auth, RBAC, rate limit)       │
└───────────┬─────────────────────────────────────────────────────────┘
            │
   ┌────────┼────────┬──────────┬──────────┬──────────┬─────────────┐
   ▼        ▼        ▼          ▼          ▼          ▼             ▼
┌──────┐ ┌──────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌─────────┐
│Elig- │ │Blue- │ │ Test   │ │Session │ │Proctor │ │Scoring │ │Reporting│
│ibility│ │print │ │Authoring│ │Runtime │ │Ingest  │ │Engine  │ │& Review │
│Svc   │ │Svc   │ │Svc     │ │Svc     │ │Svc     │ │(AI)    │ │Svc      │
└──┬───┘ └──┬───┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └────┬────┘
   │        │         │          │          │          │           │
   └────────┴─────────┴────┬─────┴──────────┴──────────┴───────────┘
                           ▼
        ┌──────────────────────────────────────────────┐
        │  PostgreSQL  (tmext_* schema)                │
        │  Redis        (session state, timers)        │
        │  Object Store (video, audio, image uploads)  │
        │  Queue        (async AI scoring jobs)        │
        └──────────────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────────┐
        │  ThriveHR ATS  ◀── eligibility + outcomes    │
        └──────────────────────────────────────────────┘
```

**Boundary rule (from attachment 2, invariant 6):** the assessment module never writes to
ATS tables. It answers questions; the ATS stores the answer on the application record.

---

## 7. Non-Negotiables

Carried directly from the attachments:

1. **Human-in-the-loop.** AI flags are "suggestions for a human to check", never automatic
   rejections.
2. **Explicit consent.** Camera and mic consent captured, timestamped and stored before any
   capture begins.
3. **Retention limits.** Video, ID images and answers auto-purge per bank policy; retention
   window is configurable per test.
4. **Low-bandwidth tolerance.** Must degrade gracefully on slow connections and low-end
   laptops. Answers auto-save; a dropped connection must never lose work.
5. **Fail-safe eligibility.** A requirements-table miss defaults to `NOT_APPLICABLE` — never
   block a candidate because of a config gap.
6. **Config-driven.** Cooling periods, attempt limits, cutoffs and thresholds come from
   settings tables. No hardcoded values.

---

## 8. Success Criteria

| Dimension | Target |
|---|---|
| Candidate completion rate | > 95% of started sessions complete without a technical failure |
| Time to report | < 5 minutes from submission to recruiter-visible report |
| False-positive flag rate | < 5% of honest candidates receive a High risk rating |
| Recruiter review time | < 3 minutes per candidate (flag clips, not full footage) |
| Eligibility API latency | p95 < 200 ms |
| Low-bandwidth floor | Fully usable at 512 kbps on a 4 GB RAM laptop |
| Accessibility | WCAG 2.1 AA on all candidate-facing screens |
