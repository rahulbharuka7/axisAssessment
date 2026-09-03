import { Router } from 'express';
import { getDb } from '../db/index.js';
import { requireRole } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { uuid } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import { evaluateEligibility } from '../services/eligibility.js';
import type { ProgramType } from '../services/requirements.js';
import { computeRisk } from '../services/scoring.js';

export const recruiterRouter = Router();
recruiterRouter.use(requireRole('RECRUITER', 'TA_ADMIN'));

recruiterRouter.get('/tests', (_req, res) => {
  const data = (getDb()
    .prepare(
      `SELECT t.*, b.name AS blueprint_name,
              (SELECT COUNT(*) FROM tmext_ai_assessment_sessions s
                WHERE s.test_id = t.id AND s.is_deleted = 0) AS invited,
              (SELECT COUNT(*) FROM tmext_ai_assessment_sessions s
                WHERE s.test_id = t.id AND s.status = 'scored' AND s.is_deleted = 0) AS completed,
              (SELECT COUNT(*) FROM tmext_ai_assessment_sessions s
                WHERE s.test_id = t.id AND s.risk_band IN ('medium','high') AND s.is_deleted = 0) AS flagged
         FROM tmext_ai_test t
         JOIN tmext_ai_blueprint b ON b.id = t.blueprint_id
        WHERE t.is_deleted = 0
        ORDER BY t.created_at DESC`,
    )
    .all() as Record<string, unknown>[])
    .map((t) => ({ ...t, proctoring: JSON.parse(t.proctoring as string) }));
  res.json({ success: true, data });
});

/** The dashboard list — docs/03 §2.3. Sort and filter by score, risk, status. */
recruiterRouter.get('/tests/:id/candidates', (req, res) => {
  const { risk, status } = req.query;
  const where = ['s.test_id = ?', 's.is_deleted = 0'];
  const params: unknown[] = [req.params.id];
  if (typeof risk === 'string') {
    where.push('s.risk_band = ?');
    params.push(risk);
  }
  if (typeof status === 'string') {
    where.push('s.status = ?');
    params.push(status);
  }

  const data = (getDb()
    .prepare(
      `SELECT s.id, s.candidate_id, s.status, s.outcome, s.total_score, s.max_score,
              s.risk_score, s.risk_band, s.attempt_number, s.started_at, s.submitted_at,
              s.section_scores,
              (SELECT COUNT(*) FROM tmext_ai_proctor_flag f
                WHERE f.session_id = s.id) AS flag_count
         FROM tmext_ai_assessment_sessions s
        WHERE ${where.join(' AND ')}
        ORDER BY CASE s.risk_band WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                 s.total_score DESC`,
    )
    .all(...params) as Record<string, unknown>[])
    .map((r) => ({
      ...r,
      section_scores: r.section_scores ? JSON.parse(r.section_scores as string) : [],
    }));

  res.json({ success: true, data });
});

/** Full report: score, risk band, section breakdown, flag timeline. */
recruiterRouter.get('/sessions/:id/report', (req, res) => {
  const db = getDb();
  const session = db
    .prepare(`SELECT * FROM tmext_ai_assessment_sessions WHERE id = ? AND is_deleted = 0`)
    .get(req.params.id) as Record<string, unknown> | undefined;
  if (!session) throw notFound('SESSION_NOT_FOUND', `No session with id ${req.params.id}`);

  const flags = (db
    .prepare(`SELECT * FROM tmext_ai_proctor_flag WHERE session_id = ? ORDER BY started_at_ms`)
    .all(req.params.id) as Record<string, unknown>[])
    .map((f) => ({
      ...f,
      evidence: f.evidence ? JSON.parse(f.evidence as string) : null,
      warned: f.warned === 1,
    }));

  res.set('Cache-Control', 'no-store');
  res.json({
    success: true,
    data: {
      session: {
        ...session,
        section_scores: session.section_scores ? JSON.parse(session.section_scores as string) : [],
      },
      flags,
    },
  });
});

/**
 * Review one flag. The override loop from docs/08 §7 — a labelled false positive
 * is the training signal that makes the next model better, so the note is
 * mandatory rather than optional.
 */
recruiterRouter.post('/sessions/:sid/flags/:fid/review', (req, res) => {
  const db = getDb();
  const { verdict, note } = req.body ?? {};
  if (verdict !== 'genuine' && verdict !== 'false_positive') {
    throw badRequest('INVALID_VERDICT', "verdict must be 'genuine' or 'false_positive'", 'verdict');
  }
  if (typeof note !== 'string' || !note.trim()) {
    throw badRequest('MISSING_FIELD', 'A note is required so the label can be audited', 'note');
  }

  const result = db
    .prepare(
      `UPDATE tmext_ai_proctor_flag
          SET review_verdict = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?
        WHERE id = ? AND session_id = ?`,
    )
    .run(verdict, note.trim(), req.principal!.sub, nowIso(), req.params.fid, req.params.sid);
  if (result.changes === 0) throw notFound('FLAG_NOT_FOUND', 'No such flag on this session');

  // Recompute — a corrected session's risk should reflect the human verdict.
  const risk = computeRisk(db, req.params.sid);
  db.prepare(
    `UPDATE tmext_ai_assessment_sessions SET risk_score = ?, risk_band = ?, updated_at = ? WHERE id = ?`,
  ).run(risk.score, risk.band, nowIso(), req.params.sid);

  audit(db, {
    actorType: 'recruiter',
    actorId: req.principal!.sub,
    action: 'flag.review',
    entityType: 'flag',
    entityId: req.params.fid,
    after: { verdict, note, recomputed_risk: risk },
    requestId: req.requestId,
  });

  res.json({ success: true, data: { flag_id: req.params.fid, verdict, risk } });
});

recruiterRouter.post('/sessions/:id/decision', (req, res) => {
  const db = getDb();
  const { decision, note } = req.body ?? {};
  if (!['shortlist', 'reject', 'hold'].includes(decision)) {
    throw badRequest('INVALID_DECISION', "decision must be 'shortlist', 'reject' or 'hold'", 'decision');
  }

  audit(db, {
    actorType: 'recruiter',
    actorId: req.principal!.sub,
    action: 'session.decision',
    entityType: 'session',
    entityId: req.params.id,
    after: { decision, note: note ?? null },
    requestId: req.requestId,
  });

  // Invariant 6 — the module does not write to the ATS. In production this
  // emits the assessment.decided webhook (docs/06 §4) and the ATS persists it.
  res.json({
    success: true,
    data: { session_id: req.params.id, decision, webhook: 'assessment.decided queued' },
  });
});

/** docs/05 §7.2 — a genuine mishap gets a supported path, not a config edit. */
recruiterRouter.post('/candidates/:candidateId/grant-attempt', (req, res) => {
  const db = getDb();
  const { role_id, reason } = req.body ?? {};
  if (!Number.isInteger(role_id)) throw badRequest('INVALID_ROLE_ID', 'role_id must be an integer');
  if (typeof reason !== 'string' || !reason.trim()) {
    throw badRequest('MISSING_FIELD', 'reason is required and is audited', 'reason');
  }

  const row = {
    id: uuid(),
    candidate_id: req.params.candidateId,
    role_id,
    reason: reason.trim(),
    granted_by: req.principal!.sub,
    created_at: nowIso(),
  };
  db.prepare(
    `INSERT INTO tmext_ai_attempt_grant
       (id, candidate_id, role_id, reason, granted_by, is_deleted, created_at)
     VALUES (@id, @candidate_id, @role_id, @reason, @granted_by, 0, @created_at)`,
  ).run(row);

  audit(db, {
    actorType: 'recruiter',
    actorId: req.principal!.sub,
    action: 'attempt.grant',
    entityType: 'candidate',
    entityId: req.params.candidateId,
    after: row,
    requestId: req.requestId,
  });

  res.status(201).json({ success: true, data: row });
});

/**
 * Preview an invite list. Runs eligibility per candidate BEFORE sending, so a
 * recruiter knows they are inviting 96 people rather than 120 (docs/06 §2.2).
 */
recruiterRouter.post('/tests/:id/invite/preview', (req, res) => {
  const db = getDb();
  const test = db
    .prepare(`SELECT role_id, program_type FROM tmext_ai_test WHERE id = ? AND is_deleted = 0`)
    .get(req.params.id) as { role_id: number; program_type: ProgramType } | undefined;
  if (!test) throw notFound('TEST_NOT_FOUND', `No test with id ${req.params.id}`);

  const candidates: string[] = Array.isArray(req.body?.candidate_ids) ? req.body.candidate_ids : [];
  const rows = candidates.map((cid) => {
    const e = evaluateEligibility(db, cid, test.role_id, test.program_type, { skipAudit: true });
    return { candidate_id: cid, status: e.status, reason: e.reason, show_button: e.show_button };
  });

  const breakdown = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  res.json({
    success: true,
    data: { total: rows.length, will_invite: rows.filter((r) => r.show_button).length, breakdown, rows },
  });
});
