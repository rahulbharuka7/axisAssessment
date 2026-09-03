-- Axis Bank AI Assessment Module — schema
--
-- Column names, nullability and semantics follow docs/01-BLUEPRINT-MODEL.md and
-- docs/05-API-ELIGIBILITY.md. SQLite is used so the project runs with no infra;
-- the shapes map 1:1 to the Postgres DDL in the docs:
--   UUID        -> TEXT (uuid v4 string)
--   TIMESTAMPTZ -> TEXT (ISO-8601 UTC, 'Z' suffix) — lexicographically sortable
--   BOOLEAN     -> INTEGER 0/1
--   JSONB       -> TEXT (JSON)
--   TEXT[]      -> TEXT (JSON array)

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── competency framework ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tmext_ai_competency_framework (
  id          TEXT PRIMARY KEY,
  name        TEXT    NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  status      TEXT    NOT NULL DEFAULT 'draft',   -- draft | published | archived
  created_by  TEXT,
  is_deleted  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  UNIQUE (name, version)
);

CREATE TABLE IF NOT EXISTS tmext_ai_meta_competency (
  id            TEXT PRIMARY KEY,
  framework_id  TEXT    NOT NULL REFERENCES tmext_ai_competency_framework(id),
  name          TEXT    NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS tmext_ai_competency (
  id                    TEXT PRIMARY KEY,
  meta_competency_id    TEXT    NOT NULL REFERENCES tmext_ai_meta_competency(id),
  parent_competency_id  TEXT    REFERENCES tmext_ai_competency(id),
  name                  TEXT    NOT NULL,
  definition            TEXT,
  behavioral_indicators TEXT,                     -- JSON array
  display_order         INTEGER NOT NULL DEFAULT 0,
  is_deleted            INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT    NOT NULL,
  updated_at            TEXT    NOT NULL
);

-- ── blueprints ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tmext_ai_blueprint (
  id                     TEXT PRIMARY KEY,
  framework_id           TEXT    NOT NULL REFERENCES tmext_ai_competency_framework(id),
  name                   TEXT    NOT NULL,
  role_id                INTEGER,
  program_type           TEXT,
  version                INTEGER NOT NULL DEFAULT 1,
  status                 TEXT    NOT NULL DEFAULT 'draft',
  total_duration_minutes INTEGER,
  overall_cutoff         REAL,
  source_file            TEXT,
  created_by             TEXT,
  is_deleted             INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT    NOT NULL,
  updated_at             TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS tmext_ai_blueprint_section (
  id               TEXT PRIMARY KEY,
  blueprint_id     TEXT    NOT NULL REFERENCES tmext_ai_blueprint(id),
  competency_id    TEXT    NOT NULL REFERENCES tmext_ai_competency(id),
  tool             TEXT    NOT NULL,              -- MCQ|SJT|MPM|SPEECHX|WRITING|CODING
  selection_rule   TEXT    NOT NULL,              -- JSON, see docs/01 §4
  duration_minutes INTEGER,
  cutoff_score     REAL,
  weight           REAL    NOT NULL DEFAULT 1,
  display_order    INTEGER NOT NULL DEFAULT 0,
  is_deleted       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);

-- ── question bank ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tmext_ai_question (
  id                TEXT PRIMARY KEY,
  competency_id     TEXT    NOT NULL REFERENCES tmext_ai_competency(id),
  tool              TEXT    NOT NULL,
  question_type     TEXT    NOT NULL,
  difficulty        TEXT,                          -- easy | medium | difficult | NULL
  body              TEXT    NOT NULL,
  media             TEXT,                          -- JSON
  options           TEXT,                          -- JSON
  answer_key        TEXT,                          -- JSON, NULL when AI-scored
  rubric_id         TEXT,
  marks_correct     REAL    NOT NULL DEFAULT 1,
  marks_wrong       REAL    NOT NULL DEFAULT 0,
  marks_partial     REAL    NOT NULL DEFAULT 0,
  expected_time_sec INTEGER,
  status            TEXT    NOT NULL DEFAULT 'draft',
  usage_count       INTEGER NOT NULL DEFAULT 0,
  p_value           REAL,
  discrimination    REAL,
  created_by        TEXT,
  is_deleted        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL
);

-- ── tests (a blueprint instantiated for a requisition) ──────────────────────
CREATE TABLE IF NOT EXISTS tmext_ai_test (
  id                 TEXT PRIMARY KEY,
  blueprint_id       TEXT    NOT NULL REFERENCES tmext_ai_blueprint(id),
  name               TEXT    NOT NULL,
  role_id            INTEGER NOT NULL,
  program_type       TEXT    NOT NULL,
  status             TEXT    NOT NULL DEFAULT 'draft',  -- draft|live|paused|archived
  opens_at           TEXT,
  closes_at          TEXT,
  duration_minutes   INTEGER,
  overall_cutoff     REAL,
  enforce_section_cutoffs INTEGER NOT NULL DEFAULT 1,
  negative_marking   REAL    NOT NULL DEFAULT 0,
  allow_retake       INTEGER NOT NULL DEFAULT 1,
  max_attempts       INTEGER,
  cooldown_hours     INTEGER NOT NULL DEFAULT 24,
  score_policy       TEXT    NOT NULL DEFAULT 'best',
  proctoring         TEXT    NOT NULL,            -- JSON, see docs/03 §2.2 step 4
  created_by         TEXT,
  is_deleted         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS tmext_ai_test_question (
  id            TEXT PRIMARY KEY,
  test_id       TEXT    NOT NULL REFERENCES tmext_ai_test(id),
  section_id    TEXT    NOT NULL REFERENCES tmext_ai_blueprint_section(id),
  question_id   TEXT    NOT NULL REFERENCES tmext_ai_question(id),
  display_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (test_id, question_id)
);

-- ── eligibility: requirements, settings, sessions (docs/05 §6) ──────────────
CREATE TABLE IF NOT EXISTS tmext_ai_assessment_requirements (
  id           TEXT PRIMARY KEY,
  role_id      INTEGER NOT NULL,
  role_name    TEXT    NOT NULL,
  program_type TEXT,                              -- NULL = wildcard, all programs
  required     INTEGER NOT NULL,
  created_by   TEXT,
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);

-- docs/05 §2.1 — precedence enforced in the schema, not left to data entry.
CREATE UNIQUE INDEX IF NOT EXISTS uq_req_exact
  ON tmext_ai_assessment_requirements (role_id, program_type)
  WHERE is_deleted = 0 AND program_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_req_wildcard
  ON tmext_ai_assessment_requirements (role_id)
  WHERE is_deleted = 0 AND program_type IS NULL;

CREATE TABLE IF NOT EXISTS tmext_ai_assessment_settings (
  id                        TEXT PRIMARY KEY,
  role_id                   INTEGER,              -- NULL = global default
  cooling_period_pass_days  INTEGER NOT NULL DEFAULT 180,
  cooling_period_fail_days  INTEGER NOT NULL DEFAULT 90,
  max_attempts              INTEGER,              -- NULL = unlimited
  score_policy              TEXT    NOT NULL DEFAULT 'best',
  session_ttl_minutes       INTEGER NOT NULL DEFAULT 240,
  recording_retention_days  INTEGER NOT NULL DEFAULT 90,
  id_image_retention_days   INTEGER NOT NULL DEFAULT 30,
  answer_retention_days     INTEGER NOT NULL DEFAULT 730,
  result_visibility         TEXT    NOT NULL DEFAULT 'basic',  -- none|basic|detailed
  updated_by                TEXT,
  updated_at                TEXT    NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_settings_global
  ON tmext_ai_assessment_settings (role_id) WHERE role_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tmext_ai_assessment_sessions (
  id             TEXT PRIMARY KEY,
  candidate_id   TEXT    NOT NULL,
  role_id        INTEGER NOT NULL,
  program_type   TEXT    NOT NULL,
  test_id        TEXT    REFERENCES tmext_ai_test(id),
  blueprint_id   TEXT    REFERENCES tmext_ai_blueprint(id),
  status         TEXT    NOT NULL,   -- not_started|in_progress|submitted|scoring
                                     -- |scored|expired|abandoned|voided
  outcome        TEXT,               -- pass|fail|inconclusive, NULL until scored
  total_score    REAL,
  max_score      REAL,
  section_scores TEXT,               -- JSON
  risk_score     REAL,
  risk_band      TEXT,               -- low|medium|high
  consent_at     TEXT,
  started_at     TEXT,
  expires_at     TEXT,               -- docs/05 §12.4 hard expiry
  submitted_at   TEXT,
  scored_at      TEXT,               -- drives the cooling calculation
  attempt_number INTEGER NOT NULL DEFAULT 1,
  is_deleted     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_elig
  ON tmext_ai_assessment_sessions (candidate_id, role_id, status, scored_at DESC)
  WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_sessions_active
  ON tmext_ai_assessment_sessions (candidate_id, role_id)
  WHERE is_deleted = 0 AND status IN ('in_progress','submitted','scoring');

-- Extra attempts granted by a recruiter (docs/05 §7.2)
CREATE TABLE IF NOT EXISTS tmext_ai_attempt_grant (
  id           TEXT PRIMARY KEY,
  candidate_id TEXT    NOT NULL,
  role_id      INTEGER NOT NULL,
  reason       TEXT    NOT NULL,
  granted_by   TEXT    NOT NULL,
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_grant_lookup
  ON tmext_ai_attempt_grant (candidate_id, role_id) WHERE is_deleted = 0;

-- ── answers, flags, audit ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tmext_ai_answer (
  id              TEXT PRIMARY KEY,
  session_id      TEXT    NOT NULL REFERENCES tmext_ai_assessment_sessions(id),
  question_id     TEXT    NOT NULL REFERENCES tmext_ai_question(id),
  value           TEXT,                            -- JSON
  client_revision INTEGER NOT NULL DEFAULT 0,      -- idempotency, docs/06 §1
  marked_review   INTEGER NOT NULL DEFAULT 0,
  score           REAL,
  score_detail    TEXT,                            -- JSON, per-dimension + quote
  answered_at     TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  UNIQUE (session_id, question_id)
);

CREATE TABLE IF NOT EXISTS tmext_ai_proctor_flag (
  id             TEXT PRIMARY KEY,
  session_id     TEXT    NOT NULL REFERENCES tmext_ai_assessment_sessions(id),
  flag_type      TEXT    NOT NULL,
  started_at_ms  INTEGER NOT NULL,
  duration_ms    INTEGER,
  confidence     REAL,
  detected_by    TEXT    NOT NULL,                 -- realtime | posthoc
  model_version  TEXT    NOT NULL,
  evidence       TEXT,                             -- JSON
  warned         INTEGER NOT NULL DEFAULT 0,
  reviewed_by    TEXT,
  review_verdict TEXT,                             -- genuine | false_positive
  review_note    TEXT,
  reviewed_at    TEXT,
  created_at     TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flag_session
  ON tmext_ai_proctor_flag (session_id, started_at_ms);

CREATE TABLE IF NOT EXISTS tmext_ai_assessment_audit (
  id          TEXT PRIMARY KEY,
  actor_type  TEXT NOT NULL,                       -- candidate|recruiter|admin|system
  actor_id    TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  before      TEXT,                                -- JSON
  after       TEXT,                                -- JSON
  request_id  TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON tmext_ai_assessment_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON tmext_ai_assessment_audit (actor_id, created_at DESC);

-- ── minimal ATS stand-in, so role_id can be validated (docs/05 invariant 2) ──
CREATE TABLE IF NOT EXISTS tmext_job (
  role_id   INTEGER PRIMARY KEY,
  role_name TEXT NOT NULL
);
