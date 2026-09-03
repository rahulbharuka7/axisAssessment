# 03 — Persona: Recruiter

> *"Build the test, invite the people, read the signal, make the call."*

The Recruiter is the module's heaviest user and the only persona who makes a hiring
decision. Everything the AI produces exists to make their three minutes per candidate
count.

**Role code:** `RECRUITER` · **Volume:** 40–150 users · **Frequency:** daily

---

## 1. Responsibilities

| Area | Owns |
|---|---|
| Test creation | Instantiate a published blueprint as a live test for a requisition |
| Question sourcing | Pick from the bank, bulk-upload an Excel blueprint, or author items |
| Test configuration | Duration, cutoffs, window, retake rules, proctoring toggles |
| Invitations | Send links by email/SMS, track delivery and start |
| Live monitoring | Watch who is in-progress, who has stalled, who is flagged |
| Review | Watch flagged clips, read AI scores, override false positives |
| Decisioning | Shortlist / reject / hold, and push the outcome to the ATS pipeline |

---

## 2. Screens

### 2.1 Recruiter Dashboard

The landing screen. Answers *"what needs me today?"* before it shows anything else.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Assessments                                        [+ Create Test]      │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐            │
│  │ Invited    │ │ In progress│ │ Awaiting   │ │ High risk  │            │
│  │            │ │            │ │ review     │ │            │            │
│  │    248     │ │     17     │ │     62     │ │     9      │            │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘            │
│                                                                          │
│  ACTIVE TESTS                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Retail Officer — Lateral Q3        Live · closes 10 Sep            │ │
│  │ 120 invited · 84 completed · 12 flagged           [Open]           │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │ Sales Officer — Campus Drive       Live · closes 15 Sep            │ │
│  │ 300 invited · 141 completed · 6 flagged           [Open]           │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │ Branch Manager — Lateral           Draft                           │ │
│  │ Not published                                     [Edit]           │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Create Test — 5-step wizard

Implements `AI_Assessment_Module_Plan.txt` §6 in full.

```
 ①Basics ──▶ ②Questions ──▶ ③Settings ──▶ ④Proctoring ──▶ ⑤Review
```

#### Step 1 — Basics

```
Test name        [ Retail Officer — Lateral Q3 ____________ ]
Job role         [ Retail Officer (101) ▾ ]
Program type     [ lateral ▾ ]
Blueprint        [ Retail Officer Blueprint v3 ▾ ]   ⓘ published by TA-Admin

  Loaded from blueprint:
  ✓ Cognitive Ability      16 questions · 20 min · cutoff 8 per competency
  ✓ Written English         1 question  · 15 min · cutoff 10
  ✓ SpeechX                64 questions · 45 min
  ✓ Sales Personality      MPM + SJT    · norm-referenced
  ─────────────────────────────────────────────────────────
  Total                    ~105 minutes

  Sections are pre-checked from the blueprint. Unchecking one records a
  deviation note on the test for audit.
```

Starting from a blueprint rather than a blank form is the central design choice: it means a
recruiter cannot accidentally ship a test that does not match the competency framework the
role was signed off against.

#### Step 2 — Questions

Three sourcing routes, per attachment 1 §6A:

```
┌─ How do you want to fill these sections? ───────────────────────────────┐
│                                                                         │
│  (•) Auto-fill from question bank        ← default, honours the         │
│      Randomised per candidate               blueprint selection rules   │
│                                                                         │
│  ( ) Bulk upload from Excel                                             │
│      Drop a blueprint sheet — same layout you already use               │
│                                                                         │
│  ( ) Pick questions manually                                            │
│      Browse the bank section by section                                 │
└─────────────────────────────────────────────────────────────────────────┘

  SECTION FILL STATUS
  Analytical Ability      8/8   ✓  (E4 M3 D1 — matches blueprint)
  Numerical Ability       8/8   ✓  (E4 M3 D1)
  Writing Skills          1/1   ✓
  Pronunciation          10/10  ✓
  Fluency                 4/4   ✓
  Grammar                34/34  ✓
  Listening Comp.        16/16  ✓
  Sales Personality      MPM instrument · 11 sub-competencies  ✓

  ⚠ Pool depth: Numerical Ability has 11 approved Difficult items for a
    pool of 300 candidates. Consider adding items to reduce repetition.
```

**Excel upload** runs the doc 01 §6 pipeline and always shows a parsed preview before
commit — including the declared-vs-actual mismatch warnings.

**Per-question editing** (attachment 1 §6A): type, attached image, marks for
correct/wrong/partial, competency tag, difficulty.

**Randomisation:** shuffle question order, shuffle option order, and draw N from a larger
pool so no two candidates see an identical paper.

#### Step 3 — Test Settings

```
DURATION
  Overall time limit          [ 105 ] minutes
  ☑ Per-section time limits   (loaded from blueprint, editable)
  ☐ Per-question time limit

SCORING
  Overall cutoff              [ 60 ] %
  ☑ Per-section cutoffs       Analytical 8 · Numerical 8 · Writing 10
  Negative marking            [ 0 ] per wrong answer
  ☑ Candidate must clear every section cutoff, not just the overall

TEST WINDOW
  Opens   [ 05 Sep 2026 ] [ 09:00 ]
  Closes  [ 10 Sep 2026 ] [ 23:59 ]     Timezone: IST

RETAKE RULES
  ☑ Allow retake
  Maximum attempts            [ 2 ]        ⓘ policy default from TA-Admin
  Cooldown between attempts   [ 24 ] hours
  Score that counts           (•) Best  ( ) Latest  ( ) Average

  ⓘ These override the global policy for this test only, and are audited.
    They cannot exceed the TA-Admin maximum.
```

#### Step 4 — Proctoring

Every toggle from attachment 1 §6C.

```
  Proctoring for this test          [ ●───  ON ]

  CHECKS
  ☑ Webcam face match at login
  ☑ Continuous face presence during test
  ☑ Multiple person / second face detection
  ☑ Tab or window switch detection
  ☑ Block copy-paste
  ☑ Enforce full screen
  ☐ Mobile phone / second device detection      ⓘ higher false-positive rate

  VIOLATION HANDLING
  Warning limit                [ 3 ] warnings
  After the limit is crossed:
    ( ) Auto-submit and end the test
    (•) Lock the test and notify the recruiter
    ( ) Flag in the report only — do not interrupt the candidate

  RECORDING
  Retain proctoring video for  [ 90 ] days      ⓘ capped by bank policy

  ⚠ Candidates will be shown a consent screen before any capture begins.
    A candidate who declines cannot proceed, and is reported as
    "consent declined" — not as a failure.
```

The third violation option exists because interrupting an honest candidate is a worse
outcome than reviewing a flag afterwards. It is the recommended default for campus drives,
where bandwidth and shared spaces generate noise.

#### Step 5 — Review & Publish

- **Preview as candidate** — walk the exact test, including the system check.
- Blueprint compliance summary; any deviation listed explicitly.
- Publish → generates a shareable link, or sends to an uploaded candidate list.
- Post-publish: pause, edit or archive — **but once a candidate has started, question
  content locks**, per attachment 1 §6D. Settings that do not affect fairness (window
  close date, notification copy) stay editable.

### 2.3 Candidate List — the review workhorse

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Retail Officer — Lateral Q3        84 of 120 completed                  │
│  [Status ▾] [Risk ▾] [Score ▾] [Section ▾]  🔍[______]  [Export] [Bulk ▾]│
├──────────────────────────────────────────────────────────────────────────┤
│ ☐ Candidate      Status      Score  Cog  Wri  Spx  Per  Risk    Flags    │
│ ──────────────────────────────────────────────────────────────────────── │
│ ☐ A. Sharma      Completed    78%   16   12   B+   Fit  ● Low     0      │
│ ☐ R. Iyer        Completed    71%   14   11   A-   Fit  ● Med     2   ▸  │
│ ☐ M. Khan        Completed    83%   15   14   A    Fit  ● High    7   ▸  │
│ ☐ S. Patel       In progress   —     —    —    —    —   ● Low     1      │
│ ☐ N. Rao         Not started   —     —    —    —    —    —        —      │
│ ☐ D. Bose        Completed    45%    8    6   C+   Gap  ● Low     0      │
└──────────────────────────────────────────────────────────────────────────┘
```

Sort and filter by score, proctoring risk, section band, or role — attachment 1 §D.
Bulk actions: shortlist, reject, hold, resend invite, extend window, export.

**M. Khan is the case the whole product exists for**: the highest score in the list, and
seven flags. The dashboard must make that tension impossible to miss and trivial to
investigate — never resolve it automatically.

### 2.4 Candidate Report

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ← Back      M. Khan · Retail Officer — Lateral Q3 · Attempt 1 of 2      │
├──────────────────────────────────────────────────────────────────────────┤
│  OVERALL 83%   ● HIGH RISK  7 flags        [Shortlist] [Hold] [Reject]   │
│                                                                          │
│  SECTION BREAKDOWN                          (blueprint competencies)     │
│   Analytical Ability & Problem Solving  15/16  ████████████░  cutoff 8 ✓ │
│   Numerical Ability                     14/16  ███████████░░  cutoff 8 ✓ │
│   Writing Skills                        14/20  ████████░░░░░  cutoff 10 ✓│
│   SpeechX — Pronunciation                  A   ████████████░               │
│   SpeechX — Fluency                       B+   ██████████░░░               │
│   SpeechX — Grammar                        A   ████████████░               │
│   SpeechX — Listening Comprehension       A-   ███████████░░               │
│   Sales Personality                      Fit   norm band: 68th pct        │
│                                                                          │
│  ── PROCTORING TIMELINE ─────────────────────────────────────────────    │
│  0:00 ─●──────●───────────────●─●─●──────────────●──────────── 1:45      │
│        │      │               │ │ │              │                       │
│        │      │               │ │ │              └ Tab switch    1:22:04 │
│        │      │               │ │ └ Second face             0:48:31      │
│        │      │               │ └── Face not visible 14s     0:47:02      │
│        │      │               └──── Second face              0:46:55      │
│        │      └─ Copy-paste blocked                0:21:40               │
│        └─ Face match at login: 94% ✓               0:00:12               │
│                                                                          │
│  FLAGGED MOMENTS                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ ▶ 0:46:55  Second person detected      confidence 0.91   [Review]  │ │
│  │   ┌──────────────┐  A second face was visible for 96 seconds       │ │
│  │   │ [clip 0:46]  │  across three detections.                       │ │
│  │   └──────────────┘  [✓ Genuine violation] [✗ False positive]       │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │ ▶ 1:22:04  Tab switch, 41 seconds      confidence 1.00   [Review]  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  RECRUITER OVERRIDE                                                      │
│  [ Reason for override ______________________________ ]  [Save]          │
│  ⓘ Overrides are audited and feed back into model tuning.                │
└──────────────────────────────────────────────────────────────────────────┘
```

The recruiter watches **96 seconds of clips, not 105 minutes of footage**. That ratio is
the product.

The override loop (attachment 1 §6E) is not just a correction — labelled false positives
become the training signal that makes the next model better.

### 2.5 Live Monitoring

For high-volume drives: in-progress candidates, elapsed time, live flag count, connection
health. Lets a recruiter spot a candidate whose connection is failing and extend their
window *before* it becomes a disputed result.

---

## 3. Recruiter Journey

```
Requisition opens
   │
   ├─▶ Create Test ─ blueprint → auto-fill → settings → proctoring → publish
   │
   ├─▶ Invite 120 shortlisted candidates
   │      └─ ATS calls eligibility (doc 05) for each
   │         · 96 ELIGIBLE       → invited
   │         · 18 SKIP           → prior pass carried forward, no test
   │         ·  4 PENDING_COOLING→ shown available-from date
   │         ·  2 NOT_APPLICABLE → skipped entirely
   │
   ├─▶ Monitor ─ 84 complete, 17 in progress, 19 not started
   │      └─ resend to non-starters, extend window for 2 with connection issues
   │
   ├─▶ Review ─ sort by risk desc
   │      └─ 9 High risk → watch clips → 3 genuine, 6 false positives overridden
   │
   └─▶ Decide ─ shortlist 31 · hold 12 · reject 41
          └─ outcomes pushed to ATS pipeline
```

---

## 4. What the Recruiter Cannot Do

Deliberate limits, mirroring doc 02 §4:

- Cannot edit the requirements table or global policy — that is Admin governance.
- Cannot publish a blueprint or approve a question; they propose, Admin approves.
- Cannot change AI thresholds.
- Cannot exceed the Admin's `max_attempts` ceiling on a per-test basis.
- Cannot edit question content once a candidate has started, per attachment 1 §6D.
- Cannot delete a proctoring recording ahead of its retention window.
