import { Router } from 'express';
import { getDb } from '../db/index.js';
import { requireRole } from '../lib/auth.js';
import { badRequest, forbidden } from '../lib/errors.js';
import { PROGRAM_TYPES, type ProgramType } from '../services/requirements.js';
import {
  assertOwner,
  getSession,
  saveAnswer,
  startSession,
  submitSession,
  timeRemainingSeconds,
} from '../services/sessions.js';
import { scoreSession } from '../services/scoring.js';
import { resolveSettings } from '../services/settings.js';

export const candidateRouter = Router();
candidateRouter.use(requireRole('CANDIDATE'));

candidateRouter.post('/sessions/start', (req, res) => {
  const { role_id, program_type } = req.body ?? {};
  if (!Number.isInteger(role_id)) throw badRequest('INVALID_ROLE_ID', 'role_id must be an integer');
  if (!PROGRAM_TYPES.includes(program_type)) {
    throw badRequest('INVALID_PROGRAM_TYPE', `program_type must be one of: ${PROGRAM_TYPES.join(', ')}`);
  }
  const { session, resumed } = startSession(
    getDb(),
    req.principal!.sub,
    role_id,
    program_type as ProgramType,
    { requestId: req.requestId },
  );
  res.json({ success: true, data: { ...session, resumed } });
});

/** Session state, the question list, and the server's remaining time. */
candidateRouter.get('/sessions/:id', (req, res) => {
  const db = getDb();
  const session = getSession(db, req.params.id);
  assertOwner(session, req.principal!.sub);

  const questions = db
    .prepare(
      `SELECT q.id, q.question_type, q.difficulty, q.body, q.media, q.options,
              q.marks_correct, q.expected_time_sec,
              c.name AS competency, s.id AS section_id, s.tool,
              s.duration_minutes AS section_minutes, tq.display_order,
              a.value AS answer, a.client_revision, a.marked_review
         FROM tmext_ai_test_question tq
         JOIN tmext_ai_question q          ON q.id = tq.question_id
         JOIN tmext_ai_competency c        ON c.id = q.competency_id
         JOIN tmext_ai_blueprint_section s ON s.id = tq.section_id
         LEFT JOIN tmext_ai_answer a       ON a.session_id = ? AND a.question_id = q.id
        WHERE tq.test_id = ?
        ORDER BY tq.display_order`,
    )
    .all(session.id, session.test_id) as Record<string, unknown>[];

  // The answer key never leaves the server.
  const shaped = questions.map((q) => ({
    ...q,
    media: q.media ? JSON.parse(q.media as string) : null,
    options: q.options ? JSON.parse(q.options as string) : null,
    answer: q.answer ? JSON.parse(q.answer as string) : null,
    marked_review: q.marked_review === 1,
  }));

  res.set('Cache-Control', 'no-store');
  res.json({
    success: true,
    data: {
      session,
      questions: shaped,
      time_remaining_seconds: timeRemainingSeconds(db, session),
    },
  });
});

/** Autosave. Idempotent on client_revision — see services/sessions.ts. */
candidateRouter.post('/sessions/:id/answers', (req, res) => {
  const db = getDb();
  const session = getSession(db, req.params.id);
  assertOwner(session, req.principal!.sub);

  const { question_id, value, client_revision, marked_review } = req.body ?? {};
  if (typeof question_id !== 'string') {
    throw badRequest('MISSING_FIELD', 'question_id is required', 'question_id');
  }

  const result = saveAnswer(db, session, { question_id, value, client_revision, marked_review });
  res.json({
    success: true,
    data: { ...result, time_remaining_seconds: timeRemainingSeconds(db, session) },
  });
});

/** Flush an offline buffer. Per-answer accepted/rejected, never all-or-nothing. */
candidateRouter.post('/sessions/:id/answers/batch', (req, res) => {
  const db = getDb();
  const session = getSession(db, req.params.id);
  assertOwner(session, req.principal!.sub);

  const answers = req.body?.answers;
  if (!Array.isArray(answers)) throw badRequest('MISSING_FIELD', 'answers must be an array', 'answers');

  const results = answers.map((a: Record<string, unknown>) => {
    try {
      const r = saveAnswer(db, session, {
        question_id: a.question_id as string,
        value: a.value,
        client_revision: a.client_revision as number | undefined,
        marked_review: a.marked_review as boolean | undefined,
      });
      return { question_id: a.question_id, ...r };
    } catch (e) {
      return { question_id: a.question_id, accepted: false, error: (e as Error).message };
    }
  });

  res.json({
    success: true,
    data: { results, time_remaining_seconds: timeRemainingSeconds(db, session) },
  });
});

/** Liveness + authoritative timer. Auto-submits when time is up. */
candidateRouter.post('/sessions/:id/heartbeat', (req, res) => {
  const db = getDb();
  let session = getSession(db, req.params.id);
  assertOwner(session, req.principal!.sub);

  const remaining = timeRemainingSeconds(db, session);
  if (remaining <= 0 && session.status === 'in_progress') {
    session = submitSession(db, session, { auto: true, requestId: req.requestId });
    scoreSession(db, session.id, { requestId: req.requestId });
    session = getSession(db, session.id);
  }

  res.json({
    success: true,
    data: { status: session.status, time_remaining_seconds: Math.max(0, remaining) },
  });
});

/** Batch of real-time proctoring events from the browser. */
candidateRouter.post('/sessions/:id/proctor-events', (req, res) => {
  const db = getDb();
  const session = getSession(db, req.params.id);
  assertOwner(session, req.principal!.sub);

  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  const insert = db.prepare(
    `INSERT INTO tmext_ai_proctor_flag
       (id, session_id, flag_type, started_at_ms, duration_ms, confidence,
        detected_by, model_version, evidence, warned, created_at)
     VALUES (@id, @session_id, @flag_type, @started_at_ms, @duration_ms, @confidence,
             'realtime', @model_version, @evidence, @warned, @created_at)`,
  );

  const now = new Date().toISOString();
  const tx = db.transaction((rows: Record<string, unknown>[]) => {
    for (const e of rows) {
      insert.run({
        id: crypto.randomUUID(),
        session_id: session.id,
        flag_type: String(e.flag_type ?? 'UNKNOWN'),
        started_at_ms: Number(e.started_at_ms ?? 0),
        duration_ms: e.duration_ms == null ? null : Number(e.duration_ms),
        confidence: e.confidence == null ? 1 : Number(e.confidence),
        model_version: String(e.model_version ?? 'browser-v1'),
        evidence: e.evidence ? JSON.stringify(e.evidence) : null,
        warned: e.warned ? 1 : 0,
        created_at: now,
      });
    }
  });
  tx(events);

  const count = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM tmext_ai_proctor_flag WHERE session_id = ?`)
      .get(session.id) as { n: number }
  ).n;

  res.json({ success: true, data: { recorded: events.length, total_flags: count } });
});

candidateRouter.post('/sessions/:id/submit', (req, res) => {
  const db = getDb();
  const session = getSession(db, req.params.id);
  assertOwner(session, req.principal!.sub);

  const submitted = submitSession(db, session, { requestId: req.requestId });
  const scored = scoreSession(db, submitted.id, { requestId: req.requestId });

  const answered = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM tmext_ai_answer WHERE session_id = ?`)
      .get(session.id) as { n: number }
  ).n;

  res.json({
    success: true,
    data: {
      id: scored.id,
      status: scored.status,
      submitted_at: scored.submitted_at,
      answers_received: answered,
      reference: `ASMT-${new Date().getUTCFullYear()}-${scored.id.slice(0, 6).toUpperCase()}`,
    },
  });
});

/**
 * Result, filtered by the Admin's visibility policy (docs/04 §3.7).
 *
 * Scores are never returned alongside proctoring flags at any level — a candidate
 * must not be able to infer what the detector caught, which would be a roadmap
 * for the next attempt.
 */
candidateRouter.get('/sessions/:id/result', (req, res) => {
  const db = getDb();
  const session = getSession(db, req.params.id);
  assertOwner(session, req.principal!.sub);

  const settings = resolveSettings(db, session.role_id);
  const base = { id: session.id, status: session.status, submitted_at: session.submitted_at };

  if (settings.result_visibility === 'none' || session.status !== 'scored') {
    return res.json({ success: true, data: { ...base, visibility: 'none' } });
  }
  if (settings.result_visibility === 'basic') {
    return res.json({
      success: true,
      data: { ...base, visibility: 'basic', outcome: session.outcome },
    });
  }
  res.json({
    success: true,
    data: {
      ...base,
      visibility: 'detailed',
      outcome: session.outcome,
      total_score: session.total_score,
      max_score: session.max_score,
      sections: session.section_scores ? JSON.parse(session.section_scores) : [],
    },
  });
});
