import type { DB } from '../db/index.js';
import { audit } from '../lib/audit.js';
import { nowIso } from '../lib/time.js';
import { getSession, type Session } from './sessions.js';

export interface SectionScore {
  section_id: string;
  competency: string;
  tool: string;
  score: number;
  max: number;
  cutoff: number | null;
  passed: boolean | null;
}

export interface RiskAssessment {
  score: number;
  band: 'low' | 'medium' | 'high';
}

/** docs/08 §3 — Admin-configurable in production; defaults live here. */
const FLAG_WEIGHTS: Record<string, number> = {
  FACE_MISMATCH: 25,
  MULTI_FACE: 25,
  FACE_ABSENT: 15,
  TAB_SWITCH: 15,
  COPY_PASTE: 10,
  SECOND_DEVICE: 10,
  FULLSCREEN_EXIT: 10,
  EXTRA_VOICE: 15,
  TIMING_ANOMALY: 10,
};

const BANDS = { medium: 30, high: 70 };

/**
 * risk = Σ (weight × confidence × duration_factor), clamped 0–100.
 *
 * Flags a recruiter has already marked false_positive are excluded, so a
 * corrected session's risk reflects the human verdict rather than re-asserting
 * the model's. A High band never blocks a result — docs/08 §3.
 */
export const computeRisk = (db: DB, sessionId: string): RiskAssessment => {
  const flags = db
    .prepare(
      `SELECT flag_type, confidence, duration_ms, review_verdict
         FROM tmext_ai_proctor_flag WHERE session_id = ?`,
    )
    .all(sessionId) as {
    flag_type: string;
    confidence: number | null;
    duration_ms: number | null;
    review_verdict: string | null;
  }[];

  let score = 0;
  for (const f of flags) {
    if (f.review_verdict === 'false_positive') continue;
    const weight = FLAG_WEIGHTS[f.flag_type] ?? 5;
    const confidence = f.confidence ?? 1;
    // Sustained events count for more, but saturate — a 10-minute absence is not
    // 20× worse than a 30-second one for the purpose of ordering a review queue.
    const durationFactor = f.duration_ms ? Math.min(2, 1 + f.duration_ms / 120_000) : 1;
    score += weight * confidence * durationFactor;
  }

  const clamped = Math.min(100, Math.round(score));
  const band = clamped >= BANDS.high ? 'high' : clamped >= BANDS.medium ? 'medium' : 'low';
  return { score: clamped, band };
};

/**
 * Score a submitted session and mark it scored.
 *
 * Objective items are keyed here synchronously. AI-scored items (WRITING,
 * SPEECHX, MPM) carry a null answer_key; in production those route to the async
 * pipeline in docs/08 §5. Here they are scored as "pending" and excluded from
 * the achievable maximum so a partially-scored session never reads as a low one.
 */
export const scoreSession = (
  db: DB,
  sessionId: string,
  ctx: { requestId?: string } = {},
): Session => {
  const session = getSession(db, sessionId);
  if (session.status === 'scored') return session;

  const rows = db
    .prepare(
      `SELECT q.id, q.answer_key, q.marks_correct, q.marks_wrong, q.question_type,
              q.competency_id, c.name AS competency, s.id AS section_id, s.tool,
              s.cutoff_score, a.value AS answer
         FROM tmext_ai_test_question tq
         JOIN tmext_ai_question q            ON q.id = tq.question_id
         JOIN tmext_ai_competency c          ON c.id = q.competency_id
         JOIN tmext_ai_blueprint_section s   ON s.id = tq.section_id
         LEFT JOIN tmext_ai_answer a         ON a.session_id = @sid AND a.question_id = q.id
        WHERE tq.test_id = @tid`,
    )
    .all({ sid: sessionId, tid: session.test_id }) as {
    id: string;
    answer_key: string | null;
    marks_correct: number;
    marks_wrong: number;
    question_type: string;
    competency: string;
    section_id: string;
    tool: string;
    cutoff_score: number | null;
    answer: string | null;
  }[];

  const sections = new Map<string, SectionScore>();
  let total = 0;
  let max = 0;

  for (const r of rows) {
    let sec = sections.get(r.section_id);
    if (!sec) {
      sec = {
        section_id: r.section_id,
        competency: r.competency,
        tool: r.tool,
        score: 0,
        max: 0,
        cutoff: r.cutoff_score,
        passed: null,
      };
      sections.set(r.section_id, sec);
    }

    // AI-scored item — excluded from the objective total until the async
    // pipeline returns. Reporting shows these as "scoring in progress".
    if (!r.answer_key) continue;

    sec.max += r.marks_correct;
    max += r.marks_correct;

    if (r.answer === null) continue;

    const key = JSON.parse(r.answer_key) as unknown;
    const given = JSON.parse(r.answer) as unknown;
    const correct = JSON.stringify(key) === JSON.stringify(given);

    const delta = correct ? r.marks_correct : -Math.abs(r.marks_wrong);
    sec.score += delta;
    total += delta;
  }

  for (const sec of sections.values()) {
    sec.score = Math.max(0, Math.round(sec.score * 100) / 100);
    if (sec.cutoff !== null && sec.max > 0) sec.passed = sec.score >= sec.cutoff;
  }

  total = Math.max(0, Math.round(total * 100) / 100);

  const test = db
    .prepare(
      `SELECT overall_cutoff, enforce_section_cutoffs FROM tmext_ai_test WHERE id = ?`,
    )
    .get(session.test_id) as
    | { overall_cutoff: number | null; enforce_section_cutoffs: number }
    | undefined;

  const pct = max > 0 ? (total / max) * 100 : 0;
  const overallOk = test?.overall_cutoff == null || pct >= test.overall_cutoff;
  const sectionsOk =
    test?.enforce_section_cutoffs !== 1 ||
    [...sections.values()].every((s) => s.passed !== false);

  const outcome = overallOk && sectionsOk ? 'pass' : 'fail';
  const risk = computeRisk(db, sessionId);
  const now = nowIso();

  db.prepare(
    `UPDATE tmext_ai_assessment_sessions
        SET status = 'scored', outcome = @outcome, total_score = @total, max_score = @max,
            section_scores = @sections, risk_score = @risk, risk_band = @band,
            scored_at = @now, updated_at = @now
      WHERE id = @id`,
  ).run({
    id: sessionId,
    outcome,
    total,
    max,
    sections: JSON.stringify([...sections.values()]),
    risk: risk.score,
    band: risk.band,
    now,
  });

  audit(db, {
    actorType: 'system',
    action: 'session.score',
    entityType: 'session',
    entityId: sessionId,
    after: { outcome, total, max, risk_band: risk.band },
    requestId: ctx.requestId,
  });

  return getSession(db, sessionId);
};
