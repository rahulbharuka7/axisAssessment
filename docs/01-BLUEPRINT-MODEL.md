# 01 — Blueprint & Competency Model

Derived by analysing the three supplied blueprint spreadsheets. The blueprint is the
**single source of truth** for what a test contains, how long it runs, and what score passes.

---

## 1. What The Spreadsheets Actually Contain

### 1.1 `Copy of Mercer Mettl_Blueprint_Sample2.xlsx` — sheet "Cognitive + Writing"

Header block declares the overall composition:

```
Cognitive Ability : 20 mins (16 questions)
Writing Skills    : 15 mins (1 question)
SpeechX           : 45 mins (72 questions)
```

Then two differently-shaped tables in one sheet.

**Table A — difficulty-graded competencies**

| Meta Competency | Competency | Easy | Medium | Difficult | Duration (min) | Cutoff |
|---|---|---|---|---|---|---|
| Cognitive Ability | Analytical Ability and Problem Solving | 4 | 3 | 1 | 10 | 8 |
| Cognitive Ability | Numerical Ability | 4 | 3 | 1 | 10 | 8 |
| Written English | Writing Skills | 0 | 1 | 0 | 15 | 10 |

**Table B — count-only competencies (no difficulty split)**

| Meta Competency | Competency | No. of qs | Duration (min) |
|---|---|---|---|
| SpeechX Competencies | Pronunciation | 10 | 10 |
| SpeechX Competencies | Fluency | 4 | 10 |
| SpeechX Competencies | Grammar | 34 | 15 |
| SpeechX Competencies | Listening Comprehension | 16 | 10 |

Both tables carry `Definition` and `Behavioral Indicators` (a `>`-delimited list).

### 1.2 `Copy of Mercer Mettl_Blueprint_Sample3.xlsx` — sheet "SpeechX"

The SpeechX block standalone, with an explicit totals row: **72 questions / 45 mins**.
Confirms Table B's shape is a reusable module, not an artefact of Sample2.

### 1.3 `SampleAssessment_Blueprint.xlsx` — sheet "Sales Personality"

A third shape again — **no counts, no durations, no cutoffs**. Instead a `Tools` column
spanning two instruments:

| | |
|---|---|
| **Tools** | `Personality (MPM)` · `Situational judgement` |

| Meta Competency | Sub-Competencies |
|---|---|
| Self-Management | Self-control · Self-confidence · Stress Tolerance |
| Managing the Sales Process | Result Orientation · Taking Initiatives · Information Seeking · Problem Solving |
| Managing the Customer Relationship | Empathy · Networking with People · Influencing Others · Customer Service Orientation |

11 sub-competencies across 3 meta-competencies, each with a Definition and Behavioral
Indicators.

---

## 2. The Three Blueprint Shapes

This is the key modelling insight. The spreadsheets are **not** one format — they are three,
and the data model must absorb all three without special-casing:

| Shape | Seen in | Quantity expressed as | Scored by | Cutoff |
|---|---|---|---|---|
| **A — Difficulty-graded** | Cognitive, Written English | Easy/Medium/Difficult counts | Objective key or AI rubric | Explicit numeric |
| **B — Count-only** | SpeechX | Single question count | Speech AI model | Not in sheet — set at test level |
| **C — Instrument-driven** | Sales Personality | Not specified — the instrument decides | Norm-referenced (MPM) / SJT key | Not in sheet — norm band |

**Design decision:** model quantity as a *polymorphic selection rule* rather than three
columns. Shape A emits three difficulty-bucketed rules; Shape B emits one; Shape C emits a
rule of `type = instrument` where the instrument (MPM / SJT / SpeechX) owns its own item
count and scoring.

---

## 3. Canonical Data Model

```
tmext_ai_competency_framework        (versioned container)
   │
   ├── tmext_ai_meta_competency      "Cognitive Ability", "Self-Management"
   │      │
   │      └── tmext_ai_competency    "Numerical Ability", "Self-control"
   │             │
   │             ├── definition                 TEXT
   │             ├── behavioral_indicators      TEXT[]   (split on '>')
   │             └── tmext_ai_sub_competency    (optional 3rd level, Shape C)
   │
   └── tmext_ai_blueprint            a named, versioned test recipe
          │
          └── tmext_ai_blueprint_section
                 ├── competency_id
                 ├── tool               MCQ | SJT | MPM | SPEECHX | WRITING | CODING
                 ├── selection_rule     JSONB  (see §4)
                 ├── duration_minutes   INT
                 ├── cutoff_score       NUMERIC   nullable
                 └── weight             NUMERIC
```

### 3.1 Table definitions

```sql
CREATE TABLE tmext_ai_competency_framework (
  id             UUID PRIMARY KEY,
  name           TEXT NOT NULL,
  version        INT  NOT NULL DEFAULT 1,
  status         TEXT NOT NULL,          -- draft | published | archived
  created_by     UUID,
  is_deleted     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE TABLE tmext_ai_meta_competency (
  id             UUID PRIMARY KEY,
  framework_id   UUID NOT NULL REFERENCES tmext_ai_competency_framework(id),
  name           TEXT NOT NULL,          -- 'Cognitive Ability'
  display_order  INT  NOT NULL DEFAULT 0,
  is_deleted     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tmext_ai_competency (
  id                    UUID PRIMARY KEY,
  meta_competency_id    UUID NOT NULL REFERENCES tmext_ai_meta_competency(id),
  parent_competency_id  UUID REFERENCES tmext_ai_competency(id),  -- sub-competency
  name                  TEXT NOT NULL,
  definition            TEXT,
  behavioral_indicators TEXT[],
  display_order         INT  NOT NULL DEFAULT 0,
  is_deleted            BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tmext_ai_blueprint (
  id             UUID PRIMARY KEY,
  framework_id   UUID NOT NULL REFERENCES tmext_ai_competency_framework(id),
  name           TEXT NOT NULL,          -- 'Sales Officer — Lateral'
  role_id        INTEGER,                -- ties to tmext_job
  program_type   TEXT,                   -- lateral | campus | ...
  version        INT NOT NULL DEFAULT 1,
  status         TEXT NOT NULL,          -- draft | published | archived
  total_duration_minutes INT,
  overall_cutoff NUMERIC,
  source_file    TEXT,                   -- original .xlsx filename, for audit
  created_by     UUID,
  is_deleted     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tmext_ai_blueprint_section (
  id                UUID PRIMARY KEY,
  blueprint_id      UUID NOT NULL REFERENCES tmext_ai_blueprint(id),
  competency_id     UUID NOT NULL REFERENCES tmext_ai_competency(id),
  tool              TEXT NOT NULL,       -- MCQ | SJT | MPM | SPEECHX | WRITING | CODING
  selection_rule    JSONB NOT NULL,      -- see §4
  duration_minutes  INT,
  cutoff_score      NUMERIC,
  weight            NUMERIC NOT NULL DEFAULT 1,
  display_order     INT NOT NULL DEFAULT 0,
  is_deleted        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. `selection_rule` — the polymorphic quantity

**Shape A — difficulty-graded** (Cognitive: Numerical Ability)

```json
{
  "type": "difficulty_split",
  "counts": { "easy": 4, "medium": 3, "difficult": 1 },
  "randomize": true,
  "pool_filter": { "competency": "Numerical Ability", "status": "approved" }
}
```

**Shape B — count-only** (SpeechX: Grammar)

```json
{
  "type": "fixed_count",
  "count": 34,
  "randomize": false,
  "pool_filter": { "competency": "Grammar", "tool": "SPEECHX" }
}
```

**Shape C — instrument-driven** (Sales Personality)

```json
{
  "type": "instrument",
  "instrument": "MPM",
  "instrument_version": "mpm_sales_v2",
  "sub_competencies": [
    "Self-control", "Self-confidence", "Stress Tolerance",
    "Result Orientation", "Taking Initiatives", "Information Seeking",
    "Problem Solving", "Empathy", "Networking with People",
    "Influencing Others", "Customer Service Orientation"
  ],
  "norm_group": "sales_india_2026"
}
```

A single blueprint may mix all three. The Sample2 blueprint mixes A and B.

---

## 5. Reference Blueprint — reconstructed from the attachments

Assembling the three sheets into one publishable blueprint:

| # | Section | Tool | Rule | Qs | Mins | Cutoff |
|---|---|---|---|---|---|---|
| 1 | Analytical Ability & Problem Solving | MCQ | difficulty 4/3/1 | 8 | 10 | 8 |
| 2 | Numerical Ability | MCQ | difficulty 4/3/1 | 8 | 10 | 8 |
| 3 | Writing Skills | WRITING | difficulty 0/1/0 | 1 | 15 | 10 |
| 4 | Pronunciation | SPEECHX | fixed 10 | 10 | 10 | — |
| 5 | Fluency | SPEECHX | fixed 4 | 4 | 10 | — |
| 6 | Grammar | SPEECHX | fixed 34 | 34 | 15 | — |
| 7 | Listening Comprehension | SPEECHX | fixed 16 | 16 | 10 | — |
| 8 | Sales Personality (11 sub-comp.) | MPM + SJT | instrument | ~60 | 25 | norm band |
| | **Total** | | | **~141** | **~105** | |

### Discrepancies found — must be confirmed by the business

1. **Cognitive header says 16 questions**, but the two cognitive rows sum to
   `(4+3+1) × 2 = 16`. ✅ Consistent.
2. **SpeechX header says 72 questions / 45 mins.** The four competency rows sum to
   `10+4+34+16 = 64` questions and `10+10+15+10 = 45` mins. The **question count is 8
   short**. Sample2 has an orphan row carrying a bare `8` in the count column directly under
   Pronunciation, with no competency name — almost certainly a second Pronunciation block
   (10 + 8 = 18) or an unlabelled fifth competency. **The 8 must be attributed before the
   blueprint can be published.**
3. **Sales Personality has no durations or cutoffs.** Norm-referenced instruments usually
   do not, but the test-level duration and the pass band still need to be set by the
   business.
4. **Writing Skills cutoff is 10** but only 1 question — implying the single question is
   scored out of at least 10 on a rubric, not marked right/wrong. The AI scoring rubric must
   emit a 0–N scale, not a boolean.

---

## 6. Blueprint Excel Ingestion

Recruiters bulk-upload the same sheets the business already uses. The importer must not
demand a reformat.

**Pipeline**

```
Upload .xlsx
   ↓
Sheet detection      → one blueprint section-group per sheet
   ↓
Header block parse   → regex `^(.+?):\s*(\d+)\s*mins?\s*\((\d+)\s*questions?\)$`
                        captures declared totals for cross-checking
   ↓
Table shape detection→ has Easy/Medium/Difficult cols  → Shape A
                        has "No. of qs."               → Shape B
                        has "Tools" and neither above  → Shape C
   ↓
Forward-fill          → merged Meta Competency cells carry down
   ↓
Indicator split       → split Behavioral Indicators on '>' , trim, drop empties
   ↓
Validation            → declared totals vs row sums; flag mismatches (see §5.2)
   ↓
Preview & confirm     → recruiter sees parsed result before commit
   ↓
Persist as draft blueprint v(n+1)
```

**Validation rules (blocking):**
- Every row must resolve to a known competency, or offer "create new".
- Declared header total must equal the sum of row counts, or the recruiter must explicitly
  acknowledge the variance.
- Duration sum must equal the declared section duration.
- A cutoff must not exceed the maximum achievable score for its section.

**Validation rules (warning only):**
- Competency with no behavioral indicators.
- Section with a cutoff but no questions available in the bank.
- Blueprint whose pool has fewer approved questions than the selection rule demands.

---

## 7. Question Bank

```sql
CREATE TABLE tmext_ai_question (
  id                UUID PRIMARY KEY,
  competency_id     UUID NOT NULL REFERENCES tmext_ai_competency(id),
  tool              TEXT NOT NULL,
  question_type     TEXT NOT NULL,   -- MCQ_SINGLE | MCQ_MULTI | SHORT_TEXT
                                     -- | LONG_TEXT | IMAGE_PROMPT | IMAGE_UPLOAD
                                     -- | AUDIO_RESPONSE | LIKERT | SJT | CODING
  difficulty        TEXT,            -- easy | medium | difficult | NULL
  body              TEXT NOT NULL,
  media             JSONB,           -- [{kind:'image'|'audio', asset_id, alt}]
  options           JSONB,           -- [{id, text, media, is_correct, weight}]
  answer_key        JSONB,           -- objective key, or NULL for AI-scored
  rubric_id         UUID,            -- for AI-scored items
  marks_correct     NUMERIC DEFAULT 1,
  marks_wrong       NUMERIC DEFAULT 0,   -- negative marking
  marks_partial     NUMERIC DEFAULT 0,
  expected_time_sec INT,
  status            TEXT NOT NULL,   -- draft | in_review | approved | retired
  usage_count       INT NOT NULL DEFAULT 0,
  p_value           NUMERIC,         -- observed difficulty (post-hoc)
  discrimination    NUMERIC,         -- point-biserial (post-hoc)
  created_by        UUID,
  is_deleted        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Question types** — the union of what the attachments demand:

| Type | From | Notes |
|---|---|---|
| `MCQ_SINGLE` / `MCQ_MULTI` | Attachment 1 | Standard objective |
| `SHORT_TEXT` | Attachment 1 | AI-scored against competency |
| `LONG_TEXT` | Writing Skills blueprint | Rubric-scored, 0–N scale |
| `IMAGE_PROMPT` | Attachment 1 | Diagram/chart/scenario shown to candidate |
| `IMAGE_UPLOAD` | Attachment 1 | Candidate uploads handwriting/diagram/photo |
| `AUDIO_RESPONSE` | SpeechX blueprint | Mic capture, speech-AI scored |
| `LIKERT` | MPM instrument | Forced-choice / rating personality items |
| `SJT` | Sales Personality `Tools` | Scenario + ranked responses |
| `CODING` | Attachment 1 | Phase 4 — no blueprint supplied |

**Item health.** `p_value` and `discrimination` are recomputed nightly once an item has ≥ 50
responses. Items that drift outside acceptable bands are surfaced to the Admin for review —
this is how the bank keeps the bank honest over time.
