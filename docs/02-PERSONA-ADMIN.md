# 02 — Persona: TA-Admin

> *"Set the rules everyone else operates inside."*

The Admin does not run hiring and does not take tests. They define the guardrails: which
roles need assessing, how long results stay valid, what the AI is allowed to conclude, and
how long the bank keeps a candidate's face on disk.

**Role code:** `TA_ADMIN` · **Volume:** 3–8 users · **Frequency:** weekly, plus quarterly review

---

## 1. Responsibilities

| Area | Owns |
|---|---|
| Eligibility governance | `tmext_ai_assessment_requirements` — role × program_type × required |
| Policy settings | cooling periods, max attempts, score policy, session TTL, retention |
| Competency framework | meta-competencies, competencies, definitions, behavioural indicators |
| Blueprint approval | publishing a blueprint version; nothing goes live unapproved |
| Question bank governance | approve / retire items, review drifting item statistics |
| AI thresholds | risk-band boundaries, per-check sensitivity, model version pinning |
| Compliance | consent copy, retention enforcement, audit export, DPDP obligations |
| Access | who is a recruiter, who can grant attempt exceptions |

**Explicitly not the Admin's job:** creating a test for a live requisition, inviting
candidates, or making a hire/no-hire call. Those are the Recruiter's (doc 03). The split
matters — an Admin who starts running requisitions becomes a bottleneck, and a Recruiter who
can edit cooling periods can quietly undo bank policy.

---

## 2. Screens

### 2.1 Admin Home

Governance health, not hiring metrics.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Assessment Administration                              [TA-Admin ▾]   │
├────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │
│  │ Roles        │ │ Blueprints   │ │ Items        │ │ Needs        │  │
│  │ configured   │ │ published    │ │ approved     │ │ attention    │  │
│  │      47      │ │       9      │ │    1,284     │ │      6       │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │
│                                                                        │
│  NEEDS ATTENTION                                                       │
│  ⚠  4 roles active in ATS with no requirements row  → defaulting to    │
│     NOT_APPLICABLE. Candidates are skipping assessment.    [Review]    │
│  ⚠  Blueprint "Sales Officer v2" declares 72 SpeechX questions,        │
│     sections sum to 64.                                    [Resolve]   │
│  ⚠  12 items outside acceptable discrimination band.       [Review]    │
│  ⚠  Retention job purged 340 recordings on 02 Sep.         [Log]       │
└────────────────────────────────────────────────────────────────────────┘
```

The first warning is the important one. Invariant 3's fail-safe means a missing config row
silently waves candidates through. That is correct behaviour — and it must be *loud*, or a
config gap becomes an unnoticed hiring-quality hole.

### 2.2 Requirements Configuration

Direct UI over `tmext_ai_assessment_requirements` (API in doc 05 §7).

```
┌────────────────────────────────────────────────────────────────────────┐
│  Assessment Requirements                          [+ Add requirement]  │
│  Search [_______]   Program type [All ▾]   Required [All ▾]            │
├────────────────────────────────────────────────────────────────────────┤
│  Role ID │ Role Name        │ Program Type │ Required │ Updated  │     │
│  ────────┼──────────────────┼──────────────┼──────────┼──────────┼──── │
│  101     │ Retail Officer   │ lateral      │ ● Yes    │ 12 Aug   │ ⋮   │
│  101     │ Retail Officer   │ campus       │ ○ No     │ 12 Aug   │ ⋮   │
│  102     │ Branch Manager   │ lateral      │ ● Yes    │ 04 Jul   │ ⋮   │
│  104     │ Sales Officer    │ All (*)      │ ● Yes    │ 21 Aug   │ ⋮   │
│  103     │ Campus Graduate  │ campus       │ ○ No     │ 21 Aug   │ ⋮   │
└────────────────────────────────────────────────────────────────────────┘
```

- Wildcard rows render as **`All (*)`**, never as an empty cell — a blank reads as missing
  data, and this row is the one most likely to be misread.
- Saving an exact row that a wildcard already covers shows an inline explainer:
  *"Sales Officer already has an All-programs rule (Required). This lateral rule will
  override it for lateral only."* Precedence is doc 05 §2.1.
- Deleting the last row for a role warns: *"Candidates for Retail Officer will stop being
  assessed."*

### 2.3 Policy Settings

Global defaults with per-role overrides. Every field maps to `tmext_ai_assessment_settings`.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Assessment Policy                         Scope: [Global default ▾]   │
├────────────────────────────────────────────────────────────────────────┤
│  RETAKE & VALIDITY                                                     │
│    Result validity after a pass      [ 180 ] days                      │
│      A pass inside this window is carried forward — no re-test.        │
│    Lockout after a fail             [  90 ] days                       │
│      Candidate may not re-attempt until this expires.                  │
│    Maximum attempts per role        [   2 ]   ☐ Unlimited              │
│    Score that counts                ( ) Best  (•) Latest  ( ) Average  │
│                                                                        │
│  SESSION                                                               │
│    Session hard expiry              [ 240 ] minutes                    │
│      Abandoned sessions expire and stop blocking future eligibility.   │
│                                                                        │
│  DATA RETENTION                                                        │
│    Proctoring video & audio         [  90 ] days                       │
│    ID verification images           [  30 ] days                       │
│    Answers & scores                 [ 730 ] days                       │
│    ⓘ Retention is enforced by a nightly purge. Shortening a window     │
│      purges already-eligible media on the next run.                    │
│                                                                        │
│  [ Save ]   Changes are audited and take effect on the next evaluation.│
└────────────────────────────────────────────────────────────────────────┘
```

The two cooling fields are labelled by *what they do*, not by the shared internal term
"cooling period" — see doc 05 §12.3 for why they were split.

### 2.4 Competency Framework

Tree editor over the model in doc 01. Seeded from the three supplied blueprints.

```
Framework: Axis Hiring Competencies v1              [ Publish v2 ]
│
├─ Cognitive Ability
│   ├─ Analytical Ability and Problem Solving      4 indicators   ✎
│   └─ Numerical Ability                           3 indicators   ✎
├─ Written English
│   └─ Writing Skills                              4 indicators   ✎
├─ SpeechX Competencies
│   ├─ Pronunciation · Fluency · Grammar · Listening Comprehension
└─ Sales Personality
    ├─ Self-Management
    │   └─ Self-control · Self-confidence · Stress Tolerance
    ├─ Managing the Sales Process
    │   └─ Result Orientation · Taking Initiatives ·
    │      Information Seeking · Problem Solving
    └─ Managing the Customer Relationship
        └─ Empathy · Networking with People ·
           Influencing Others · Customer Service Orientation
```

Frameworks are **versioned and immutable once published**. A blueprint pins a framework
version, so editing a competency definition can never retroactively change how a completed
assessment was scored — a hard requirement for defending a hiring decision months later.

### 2.5 AI Threshold Configuration

Where the Admin decides how suspicious the machine is allowed to be.

```
┌────────────────────────────────────────────────────────────────────────┐
│  AI & Proctoring Thresholds                                            │
├────────────────────────────────────────────────────────────────────────┤
│  RISK BANDS            Low  0 ──────── 30 ─────── 70 ──────── 100 High │
│                                    [Med]      [High]                   │
│                                                                        │
│  CHECK SENSITIVITY                     Weight   Sensitivity            │
│    Face match at login                 [ 25 ]   [High   ▾]             │
│    Continuous face presence            [ 15 ]   [Medium ▾]             │
│    Multiple person detection           [ 25 ]   [High   ▾]             │
│    Tab / window switch                 [ 15 ]   [Medium ▾]             │
│    Copy-paste attempt                  [ 10 ]   [Medium ▾]             │
│    Second device / phone               [ 10 ]   [Low    ▾]             │
│                                                                        │
│  MODEL VERSIONS      Face: face-v2.3 ▾   Speech: speechx-v1.4 ▾        │
│                      Text scoring: rubric-llm-v3 ▾                     │
│                                                                        │
│  ⓘ AI output is advisory. No threshold on this page can reject a       │
│    candidate. A recruiter always decides.                              │
└────────────────────────────────────────────────────────────────────────┘
```

Model versions are **pinned, not floating**. An assessment scored in March must be
reproducible in September; a silently upgraded model makes that impossible and makes two
candidates in the same requisition incomparable.

### 2.6 Audit & Compliance

- Filterable log over `tmext_ai_assessment_audit` — actor, action, entity, date.
- Before/after diff on every settings and requirements change.
- CSV / JSON export for compliance review.
- **Consent register** — which candidate consented, to what text version, when.
- **Retention dashboard** — what is due for purge, what was purged, what failed to purge.
- **Right-to-erasure** — locate and purge one candidate's assessment data on request,
  producing a certificate of deletion.

---

## 3. Admin Journey

```
Quarterly policy review
   │
   ├─▶ Open Needs Attention → 4 roles unconfigured
   │      └─▶ Requirements → add rows → audited
   │
   ├─▶ Review item statistics → retire 12 drifting items
   │      └─▶ Blueprints using them flagged for the Recruiter
   │
   ├─▶ Adjust fail lockout 90 → 60 days (business asked for faster re-entry)
   │      └─▶ Takes effect on next evaluation; in-flight coolings recalculated
   │
   └─▶ Export audit log for compliance
```

---

## 4. Permissions

| Capability | Admin | Recruiter | Candidate |
|---|:--:|:--:|:--:|
| Edit requirements table | ✅ | ❌ | ❌ |
| Edit policy settings | ✅ | ❌ | ❌ |
| Edit competency framework | ✅ | ❌ | ❌ |
| Publish a blueprint | ✅ | ⚠ propose | ❌ |
| Approve / retire questions | ✅ | ⚠ propose | ❌ |
| Set AI thresholds | ✅ | ❌ | ❌ |
| Create a test from a blueprint | ✅ | ✅ | ❌ |
| Invite candidates | ✅ | ✅ | ❌ |
| Review sessions & override flags | ✅ | ✅ | ❌ |
| Grant an extra attempt | ✅ | ✅ | ❌ |
| View proctoring recordings | ✅ | ✅ | ❌ |
| Export audit log | ✅ | ❌ | ❌ |
| View own result | — | — | ✅ |

⚠ = can submit for approval, cannot self-approve.
