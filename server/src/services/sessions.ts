import type { DB } from '../db/index.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { uuid } from '../lib/ids.js';
import { isoPlusMinutes, nowIso } from '../lib/time.js';
import { evaluateEligibility } from './eligibility.js';
import type { ProgramType } from './requirements.js';
import { resolveSettings } from './settings.js';

export interface Session {
  id: string;
  candidate_id: string;
  role_id: number;
  program_type: string;
  test_id: string | null;
  blueprint_id: string | null;
  status: string;
  outcome: string | null;
  total_score: number | null;
  max_score: number | null;
  section_scores: string | null;
  risk_score: number | null;
  risk_band: string | null;
  consent_at: string | null;
  started_at: string | null;
  expires_at: string | null;
  submitted_at: string | null;
  scored_at: string | null;
  attempt_number: number;
  created_at: string;
  updated_at: string;
}

export const getSession = (db: DB, id: string): Session => {
  const s = db
    .prepare(`SELECT * FROM tmext_ai_assessment_sessions WHERE id = ? AND is_deleted = 0`)
    .get(id) as Session | undefined;
  if (!s) throw notFound('SESSION_NOT_FOUND', `No session with id ${id}`);
  return s;
};

export const assertOwner = (s: Session, candidateId: string): void => {
  if (s.candidate_id !== candidateId) throw forbidden('This session belongs to another candidate');
};

/**
 * Start a new session, or resume the one already in flight.
 *
 * Gated on the same eligibility evaluation the ATS calls, so the rules cannot be
 * bypassed by POSTing straight to this endpoint — a candidate inside a cooling
 * lockout must not be able to start a test by skipping the UI.
 */
export const startSession = (
  db: DB,
  candidateId: string,
  roleId: number,
  programType: ProgramType,
  ctx: { requestId?: string } = {},
): { session: Session; resumed: boolean } => {
  const elig = evaluateEligibility(db, candidateId, roleId, programType, {
    requestId: ctx.requestId,
    skipAudit: true,
  });

  if (elig.status === 'PENDING' && elig.prior_session_id) {
    return { session: getSession(db, elig.prior_session_id), resumed: true };
  }
  if (!elig.show_button) {
    throw conflict(
      'NOT_ELIGIBLE_TO_START',
      `Cannot start: ${elig.status} (${elig.reason})`,
    );
  }

  const settings = resolveSettings(db, roleId);
  const now = nowIso();

  const test = db
    .prepare(
      `SELECT id, blueprint_id, duration_minutes FROM tmext_ai_test
        WHERE role_id = ? AND program_type = ? AND status = 'live' AND is_deleted = 0
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get(roleId, programType) as
    | { id: string; blueprint_id: string; duration_minutes: number | null }
    | undefined;

  if (!test) throw notFound('NO_LIVE_TEST', `No live test for role ${roleId} / ${programType}`);

  const attempt = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM tmext_ai_assessment_sessions
          WHERE candidate_id = ? AND role_id = ? AND is_deleted = 0`,
      )
      .get(candidateId, roleId) as { n: number }
  ).n + 1;

  const session: Session = {
    id: uuid(),
    candidate_id: candidateId,
    role_id: roleId,
    program_type: programType,
    test_id: test.id,
    blueprint_id: test.blueprint_id,
    status: 'in_progress',
    outcome: null,
    total_score: null,
    max_score: null,
    section_scores: null,
    risk_score: null,
    risk_band: null,
    consent_at: now,
    started_at: now,
    // docs/05 §12.4 — every session gets an exit.
    expires_at: isoPlusMinutes(now, settings.session_ttl_minutes),
    submitted_at: null,
    scored_at: null,
    attempt_number: attempt,
    created_at: now,
    updated_at: now,
  };

  db.prepare(
    `INSERT INTO tmext_ai_assessment_sessions
       (id, candidate_id, role_id, program_type, test_id, blueprint_id, status,
        consent_at, started_at, expires_at, attempt_number, is_deleted, created_at, updated_at)
     VALUES (@id, @candidate_id, @role_id, @program_type, @test_id, @blueprint_id, @status,
             @consent_at, @started_at, @expires_at, @attempt_number, 0, @created_at, @updated_at)`,
  ).run(session);

  audit(db, {
    actorType: 'candidate',
    actorId: candidateId,
    action: 'session.start',
    entityType: 'session',
    entityId: session.id,
    after: { role_id: roleId, program_type: programType, attempt_number: attempt },
    requestId: ctx.requestId,
  });

  return { session, resumed: false };
};

/** Server-authoritative remaining time. The client clock is display only. */
export const timeRemainingSeconds = (db: DB, s: Session): number => {
  if (!s.started_at) return 0;
  const test = s.test_id
    ? (db.prepare(`SELECT duration_minutes FROM tmext_ai_test WHERE id = ?`).get(s.test_id) as
        | { duration_minutes: number | null }
        | undefined)
    : undefined;
  const minutes = test?.duration_minutes ?? 60;
  const endsAt = new Date(s.started_at).getTime() + minutes * 60_000;
  return Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
};

export interface AnswerInput {
  question_id: string;
  value: unknown;
  client_revision?: number;
  marked_review?: boolean;
}

/**
 * Save one answer.
 *
 * Idempotent on (session_id, question_id, client_revision): an autosave retried
 * after a dropped connection must never duplicate, and a late-arriving retry
 * must never clobber a newer answer. A lower revision is accepted-but-ignored,
 * not an error — the client has already moved on and does not need a failure.
 */
export const saveAnswer = (
  db: DB,
  session: Session,
  input: AnswerInput,
): { accepted: boolean; revision: number } => {
  if (session.status !== 'in_progress') {
    throw conflict('SESSION_NOT_ACTIVE', `Session is ${session.status}`);
  }

  const belongs = db
    .prepare(`SELECT 1 FROM tmext_ai_test_question WHERE test_id = ? AND question_id = ?`)
    .get(session.test_id, input.question_id);
  if (!belongs) throw badRequest('QUESTION_NOT_IN_TEST', 'Question is not part of this test');

  const revision = input.client_revision ?? 0;
  const existing = db
    .prepare(`SELECT client_revision FROM tmext_ai_answer WHERE session_id = ? AND question_id = ?`)
    .get(session.id, input.question_id) as { client_revision: number } | undefined;

  if (existing && existing.client_revision >= revision) {
    return { accepted: false, revision: existing.client_revision };
  }

  const now = nowIso();
  db.prepare(
    `INSERT INTO tmext_ai_answer
       (id, session_id, question_id, value, client_revision, marked_review, answered_at, updated_at)
     VALUES (@id, @session_id, @question_id, @value, @rev, @mark, @now, @now)
     ON CONFLICT (session_id, question_id) DO UPDATE SET
       value = @value, client_revision = @rev, marked_review = @mark, updated_at = @now`,
  ).run({
    id: uuid(),
    session_id: session.id,
    question_id: input.question_id,
    value: JSON.stringify(input.value ?? null),
    rev: revision,
    mark: input.marked_review ? 1 : 0,
    now,
  });

  return { accepted: true, revision };
};

/** Submit. Idempotent — a double-submit returns the original submission. */
export const submitSession = (
  db: DB,
  session: Session,
  ctx: { auto?: boolean; requestId?: string } = {},
): Session => {
  if (session.status !== 'in_progress') return getSession(db, session.id);

  const now = nowIso();
  db.prepare(
    `UPDATE tmext_ai_assessment_sessions
        SET status = 'submitted', submitted_at = ?, updated_at = ? WHERE id = ?`,
  ).run(now, now, session.id);

  audit(db, {
    actorType: 'candidate',
    actorId: session.candidate_id,
    action: ctx.auto ? 'session.auto_submit' : 'session.submit',
    entityType: 'session',
    entityId: session.id,
    requestId: ctx.requestId,
  });

  return getSession(db, session.id);
};
