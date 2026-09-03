# 09 — Delivery Roadmap

Five phases, mapped to `AI_Assessment_Module_Plan.txt` §§1–5. Each phase ends in something
demonstrable to the business, not an internal milestone.

---

## Phase 0 — Foundations *(3 weeks)*

Not in the attachment, but nothing else can start without it.

- Schema: competency framework, blueprint, question bank, sessions, settings, audit
- Design system tokens and primitives (doc 07), pending brand-guideline confirmation
- Auth, RBAC for the three personas, audit plumbing
- **Eligibility API (doc 05)** — build it first: it is the ATS contract, and every other
  team plans around it
- Seed the framework from the three supplied blueprints
- CI, environments, observability

**Exit:** eligibility API live against the ATS in staging, all 22 test-matrix cases green.

**Open item to close in this phase:** the SpeechX 64-vs-72 question discrepancy
(doc 01 §5.2) — the blueprint cannot be published until the orphan `8` is attributed.

---

## Phase 1 — Core Test Engine *(5 weeks)*

> *Attachment §1 — "Basic test-taking screen with all question types, image upload in
> questions and answers, manual timer and auto-submit."*

- Candidate runtime: one question at a time, timer, section navigation
- Question types: MCQ single/multi, short text, long text, image prompt, image upload
- **Autosave + offline buffer + reconnect reconciliation** — the highest-risk item in the
  whole build; start it in week 1, not week 4
- Server-authoritative timer, auto-submit
- Candidate landing, consent, submission screens
- Recruiter: create a test from a blueprint, auto-fill from bank, publish, invite

**Exit:** a candidate completes an unproctored blueprint-driven test end to end, on a
throttled connection, without losing an answer.

---

## Phase 2 — Proctoring *(5 weeks)*

> *Attachment §2 — "Webcam/mic access and recording, basic face-match at login, tab-switch
> and multi-face detection."*

- System check + device permissions with real recovery guidance
- Identity verification (face + ID capture, embedding match, retry path)
- Media capture and chunked upload; adaptive bitrate on slow links
- Real-time checks: face presence, multi-face, tab switch, copy-paste, fullscreen
- Warning display with configured limits and actions
- Recruiter proctoring configuration screen (all toggles, doc 03 §2.2 step 4)
- Retention job

**Exit:** a proctored session records cleanly, warns fairly, and purges on schedule.
False-positive rate measured on an internal pilot group before any candidate sees it.

---

## Phase 3 — AI Analysis *(6 weeks)*

> *Attachment §3 — "Automated flagging, automated scoring of written answers against
> blueprint competencies, report generation."*

- Post-hoc video and audio analysis
- Risk aggregation and banding
- Objective scoring
- Rubric scoring of written answers from blueprint competencies, with double-scoring at the
  cutoff boundary
- SpeechX scoring — four competencies, **with accent-fairness evaluation as a release gate**
- MPM + SJT scoring against norm tables
- Report assembly within the 5-minute budget
- Model pinning and governance

**Exit:** report available < 5 min after submission; bias evaluation across skin tones and
Indian regional accents documented and signed off.

---

## Phase 4 — Dashboard & Integration *(4 weeks)*

> *Attachment §4 — "Recruiter dashboard with filters and video review; connect to Axis
> Bank's existing hiring/HR system."*

- Recruiter dashboard, candidate list, filters, bulk actions
- Candidate report with flag timeline and clip review
- Override loop and its feedback into threshold tuning
- Decision actions → ATS webhooks
- Admin consoles: requirements, settings, framework, thresholds, audit, retention
- Excel blueprint import for recruiters
- Coding-question support *(named in attachment 1; no blueprint supplied — scope to be
  confirmed before this phase starts)*

**Exit:** a recruiter runs a full requisition without leaving the module.

---

## Phase 5 — Pilot & Rollout *(6 weeks)*

> *Attachment §5 — "Run a pilot with a small batch of real candidates, fix issues found,
> roll out to all hiring rounds."*

| Stage | Scope | Gate |
|---|---|---|
| Internal dry run | 20 employees as candidates | No blocking defects |
| Limited pilot | 1 role, ~100 real candidates | Completion > 95%, false positives < 5% |
| Expanded pilot | 3 roles, ~500 candidates | p95 latency and 5-min report budget held |
| General rollout | All hiring rounds | Sign-off from TA, Compliance, InfoSec |

Pilot instrumentation must capture drop-off point, device and bandwidth profile, support
contacts per 100 candidates, and flag rate by demographic segment — the last one is how a
fairness regression gets caught before it is systemic.

---

## Timeline

```
        W1    W5    W10   W15   W21   W25   W31
        │     │     │     │     │     │     │
P0 ─────████──┤
P1      └─────████████────┤
P2            └───────────████████────┤
P3                  └───────────────████████████────┤
P4                              └───────────────────████████──┤
P5                                        └───────────────────████████████
                                                                        │
                                                              General rollout
```

≈ 31 weeks with phases overlapping where dependencies allow. Phase 3 is the long pole and
carries the most delivery risk.

---

## Team

| Role | Count | Phases |
|---|---|---|
| Tech lead / architect | 1 | all |
| Backend engineer | 3 | all |
| Frontend engineer | 3 | 1–5 |
| ML engineer (vision) | 2 | 2–3 |
| ML engineer (speech/NLP) | 1 | 3 |
| Psychometrician | 1 (part-time) | 0, 3 |
| Designer | 1 | 0–4 |
| QA / accessibility | 2 | 1–5 |
| DevOps / SRE | 1 | all |
| Product / BA | 1 | all |

The psychometrician is not optional. Norm-referenced MPM scoring, cutoff setting and item
statistics are a specialist discipline, and getting them wrong produces defensible-looking
numbers that do not measure anything.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **False positives reject honest candidates** | Severe — reputational and legal | Minimum flag durations, confidence thresholds, human-only decisions, 5% low-risk sampling, per-segment flag-rate monitoring |
| **Bias in face detection or accent scoring** | Severe — discrimination in bank hiring | Bias evaluation as a release gate in Phases 2 and 3; documented rates per segment; rollback path |
| Answer loss on poor connections | High — invalidates results, generates disputes | Offline-first design from week 1; idempotent saves; throttled-network testing as a standing CI job |
| Low-end device performance | High — excludes candidates | On-device model budgets fixed in Phase 2; 4 GB / 512 kbps floor tested every sprint |
| Blueprint ambiguity (SpeechX 64 vs 72) | Medium — blocks publication | Resolve in Phase 0 with the business |
| Brand values unconfirmed | Low | Tokens are CSS custom properties; one file to re-point (doc 07) |
| Scope creep into coding assessments | Medium | Explicitly deferred to Phase 4, conditional on a supplied blueprint |
| ATS contract drift | Medium | Eligibility API versioned and additive-only; webhook signing and idempotency keys |
| Retention / DPDP non-compliance | Severe | Retention enforced by job not policy; consent register; erasure endpoint; InfoSec sign-off gates rollout |

---

## Open Questions for the Business

1. **SpeechX question count** — the blueprint header declares 72; the four competency rows
   sum to 64, with an orphan `8` under Pronunciation. Which competency owns those 8?
2. **Sales Personality duration and cutoff** — the blueprint carries neither. What is the
   time allowance and the pass band?
3. **Writing Skills scale** — cutoff 10 on a single question implies a rubric out of at
   least 10. Confirm the maximum (assumed 20 in doc 08 §5.2).
4. **Cooling periods** — doc 05 §12.3 proposes splitting pass (180d carry-forward) and fail
   (90d lockout). Confirm both values.
5. **Max attempts** — attachment 1 says "e.g. max 2". Confirm the policy default and whether
   recruiters may override it per test.
6. **Result visibility** — how much does a candidate see: status only, pass/fail, or
   detailed section feedback (doc 04 §3.7)?
7. **Coding assessments** — named in attachment 1 §6A but no blueprint supplied. In or out
   of v1?
8. **Retention windows** — 90d video / 30d ID / 730d answers are proposed defaults. Confirm
   against bank policy.
9. **Brand guidelines** — please supply the official Axis palette and type licences so
   doc 07's tokens can be confirmed.
