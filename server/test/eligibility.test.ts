/**
 * The 22-case eligibility matrix from docs/05 §11, plus the API-surface cases.
 *
 * These are the regression tests for the five gaps in §12 — in particular case 6,
 * which fails against the spec's original step ordering.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { openMemoryDb, setDb, type DB } from '../src/db/index.js';
import { evaluateEligibility } from '../src/services/eligibility.js';
import { createRequirement } from '../src/services/requirements.js';
import { updateSettings } from '../src/services/settings.js';
import { uuid } from '../src/lib/ids.js';
import { isoPlusDays, isoPlusMinutes, nowIso } from '../src/lib/time.js';

let db: DB;
const CAND = 'cand-001';

const daysAgo = (n: number) => isoPlusDays(nowIso(), -n);

const settings = () =>
  db.prepare(
    `INSERT INTO tmext_ai_assessment_settings
       (id, role_id, cooling_period_pass_days, cooling_period_fail_days, max_attempts,
        score_policy, session_ttl_minutes, recording_retention_days,
        id_image_retention_days, answer_retention_days, result_visibility, updated_by, updated_at)
     VALUES ('settings-global', NULL, 180, 90, 2, 'best', 240, 90, 30, 730, 'basic', 'test', ?)`,
  ).run(nowIso());

const addSession = (o: {
  status: string;
  outcome?: string | null;
  scoredAt?: string | null;
  expiresAt?: string | null;
  roleId?: number;
}) => {
  const id = uuid();
  db.prepare(
    `INSERT INTO tmext_ai_assessment_sessions
       (id, candidate_id, role_id, program_type, status, outcome, scored_at, expires_at,
        attempt_number, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, 'lateral', ?, ?, ?, ?, 1, 0, ?, ?)`,
  ).run(
    id, CAND, o.roleId ?? 101, o.status, o.outcome ?? null,
    o.scoredAt ?? null, o.expiresAt ?? null, nowIso(), nowIso(),
  );
  return id;
};

const evaluate = (roleId = 101, program: 'lateral' | 'campus' = 'lateral') =>
  evaluateEligibility(db, CAND, roleId, program, { skipAudit: true });

beforeEach(() => {
  db = openMemoryDb();
  setDb(db);
  settings();
  db.prepare(`INSERT INTO tmext_job (role_id, role_name) VALUES (101, 'Retail Officer')`).run();
  db.prepare(`INSERT INTO tmext_job (role_id, role_name) VALUES (104, 'Sales Officer')`).run();
});

const require101 = (required = true) =>
  createRequirement(db, { role_id: 101, role_name: 'Retail Officer', program_type: 'lateral', required }, 'admin');

describe('requirements resolution', () => {
  it('1 — role absent from the requirements table is NOT_APPLICABLE (fail safe)', () => {
    const r = evaluate();
    expect(r.status).toBe('NOT_APPLICABLE');
    expect(r.reason).toBe('ROLE_NOT_REQUIRED');
    expect(r.show_button).toBe(false);
  });

  it('2 — a row with required = false is NOT_APPLICABLE', () => {
    require101(false);
    expect(evaluate().status).toBe('NOT_APPLICABLE');
  });

  it('3 — an exact row beats a wildcard row', () => {
    createRequirement(db, { role_id: 104, role_name: 'Sales Officer', program_type: null, required: false }, 'a');
    createRequirement(db, { role_id: 104, role_name: 'Sales Officer', program_type: 'lateral', required: true }, 'a');
    expect(evaluate(104).status).toBe('ELIGIBLE');       // exact (true) wins
    expect(evaluate(104, 'campus').status).toBe('NOT_APPLICABLE'); // falls to wildcard (false)
  });

  it('4 — a wildcard row alone applies to every program type', () => {
    createRequirement(db, { role_id: 104, role_name: 'Sales Officer', program_type: null, required: true }, 'a');
    expect(evaluate(104).status).toBe('ELIGIBLE');
    expect(evaluate(104, 'campus').status).toBe('ELIGIBLE');
  });

  it('rejects a duplicate rule for the same role + program', () => {
    require101();
    expect(() => require101()).toThrow(/already exists/i);
  });
});

describe('first attempt', () => {
  it('5 — required with no prior session is ELIGIBLE / NO_PRIOR_RECORD', () => {
    require101();
    const r = evaluate();
    expect(r.status).toBe('ELIGIBLE');
    expect(r.reason).toBe('NO_PRIOR_RECORD');
    expect(r.show_button).toBe(true);
  });
});

describe('active session — docs/05 §12.1', () => {
  /**
   * The regression test for the spec's live logic bug. Under the original step
   * order (history before in-progress), this returns ELIGIBLE / NO_PRIOR_RECORD
   * and the candidate is offered a second Start button mid-test.
   */
  it('6 — in_progress on a FIRST attempt is PENDING, not ELIGIBLE', () => {
    require101();
    const id = addSession({ status: 'in_progress', expiresAt: isoPlusMinutes(nowIso(), 120) });
    const r = evaluate();
    expect(r.status).toBe('PENDING');
    expect(r.reason).toBe('ATTEMPT_IN_PROGRESS');
    expect(r.show_button).toBe(false);
    expect(r.prior_session_id).toBe(id);
  });

  it('7 — submitted and awaiting scoring is PENDING', () => {
    require101();
    addSession({ status: 'submitted' });
    expect(evaluate().reason).toBe('ATTEMPT_IN_PROGRESS');
  });

  it('7b — scoring in flight is PENDING', () => {
    require101();
    addSession({ status: 'scoring' });
    expect(evaluate().reason).toBe('ATTEMPT_IN_PROGRESS');
  });

  it('8 — a session past expires_at is swept and evaluation continues', () => {
    require101();
    const id = addSession({ status: 'in_progress', expiresAt: isoPlusMinutes(nowIso(), -5) });
    const r = evaluate();
    expect(r.status).toBe('ELIGIBLE');
    expect(r.reason).toBe('NO_PRIOR_RECORD');
    const row = db.prepare(`SELECT status FROM tmext_ai_assessment_sessions WHERE id = ?`).get(id) as { status: string };
    expect(row.status).toBe('expired');
  });
});

describe('cooling periods — docs/05 §12.3', () => {
  it('9 — prior pass inside the window is SKIP (carry forward)', () => {
    require101();
    const id = addSession({ status: 'scored', outcome: 'pass', scoredAt: daysAgo(30) });
    const r = evaluate();
    expect(r.status).toBe('SKIP');
    expect(r.reason).toBe('PRIOR_PASS_IN_COOLING');
    expect(r.prior_session_id).toBe(id);
    expect(r.cooling_ends_at).not.toBeNull();
  });

  it('10 — prior pass past the window is ELIGIBLE again', () => {
    require101();
    addSession({ status: 'scored', outcome: 'pass', scoredAt: daysAgo(200) });
    const r = evaluate();
    expect(r.status).toBe('ELIGIBLE');
    expect(r.reason).toBe('PRIOR_PASS_COOLING_EXPIRED');
  });

  it('11 — prior fail inside the window is PENDING_COOLING', () => {
    require101();
    addSession({ status: 'scored', outcome: 'fail', scoredAt: daysAgo(10) });
    const r = evaluate();
    expect(r.status).toBe('PENDING_COOLING');
    expect(r.reason).toBe('PRIOR_FAIL_IN_COOLING');
    expect(r.show_button).toBe(false);
  });

  it('12 — prior fail past the window, attempts remaining, is ELIGIBLE', () => {
    require101();
    addSession({ status: 'scored', outcome: 'fail', scoredAt: daysAgo(120) });
    const r = evaluate();
    expect(r.status).toBe('ELIGIBLE');
    expect(r.reason).toBe('PRIOR_FAIL_COOLING_EXPIRED');
  });

  it('pass and fail windows are independent — 120 days is past fail but inside pass', () => {
    require101();
    addSession({ status: 'scored', outcome: 'fail', scoredAt: daysAgo(120) });
    expect(evaluate().status).toBe('ELIGIBLE');

    db = openMemoryDb();
    setDb(db);
    settings();
    db.prepare(`INSERT INTO tmext_job (role_id, role_name) VALUES (101, 'Retail Officer')`).run();
    require101();
    addSession({ status: 'scored', outcome: 'pass', scoredAt: daysAgo(120) });
    expect(evaluate().status).toBe('SKIP');
  });
});

describe('attempt budget — docs/05 §12.2', () => {
  it('13 — cooling expired but attempts spent is NOT_ELIGIBLE', () => {
    require101();
    addSession({ status: 'scored', outcome: 'fail', scoredAt: daysAgo(300) });
    addSession({ status: 'scored', outcome: 'fail', scoredAt: daysAgo(200) });
    const r = evaluate();
    expect(r.status).toBe('NOT_ELIGIBLE');
    expect(r.reason).toBe('MAX_ATTEMPTS_EXHAUSTED');
    expect(r.attempts_used).toBe(2);
    expect(r.max_attempts).toBe(2);
  });

  it('14 — a recruiter grant reopens an exhausted budget', () => {
    require101();
    addSession({ status: 'scored', outcome: 'fail', scoredAt: daysAgo(300) });
    addSession({ status: 'scored', outcome: 'fail', scoredAt: daysAgo(200) });
    expect(evaluate().status).toBe('NOT_ELIGIBLE');

    db.prepare(
      `INSERT INTO tmext_ai_attempt_grant (id, candidate_id, role_id, reason, granted_by, is_deleted, created_at)
       VALUES (?, ?, 101, 'Power cut mid-test, verified', 'rec-1', 0, ?)`,
    ).run(uuid(), CAND, nowIso());

    const r = evaluate();
    expect(r.status).toBe('ELIGIBLE');
    expect(r.reason).toBe('PRIOR_FAIL_COOLING_EXPIRED');
    expect(r.max_attempts).toBe(3);
  });

  it('a valid pass in cooling is never blocked by a spent budget', () => {
    // Regression: the budget caps retries, it must not invalidate a pass the
    // candidate already earned. Ordering the check before cooling returned
    // NOT_ELIGIBLE for someone who had passed 10 days ago.
    require101();
    addSession({ status: 'scored', outcome: 'fail', scoredAt: daysAgo(300) });
    addSession({ status: 'scored', outcome: 'pass', scoredAt: daysAgo(10) });
    const r = evaluate();
    expect(r.attempts_used).toBe(2);
    expect(r.max_attempts).toBe(2);
    expect(r.status).toBe('SKIP');
  });

  it('a fail still in cooling reports the cooling, not the spent budget', () => {
    require101();
    addSession({ status: 'scored', outcome: 'fail', scoredAt: daysAgo(300) });
    addSession({ status: 'scored', outcome: 'fail', scoredAt: daysAgo(10) });
    const r = evaluate();
    expect(r.status).toBe('PENDING_COOLING');
    expect(r.cooling_ends_at).not.toBeNull();
  });

  it('22 — max_attempts NULL means unlimited', () => {
    require101();
    updateSettings(db, null, { max_attempts: null }, 'admin');
    addSession({ status: 'scored', outcome: 'fail', scoredAt: daysAgo(300) });
    addSession({ status: 'scored', outcome: 'fail', scoredAt: daysAgo(200) });
    addSession({ status: 'scored', outcome: 'fail', scoredAt: daysAgo(150) });
    const r = evaluate();
    expect(r.status).toBe('ELIGIBLE');
    expect(r.max_attempts).toBeNull();
  });
});

describe('history selection', () => {
  it('15 — the most recent scored session drives the decision', () => {
    require101();
    addSession({ status: 'scored', outcome: 'fail', scoredAt: daysAgo(300) });
    const recent = addSession({ status: 'scored', outcome: 'pass', scoredAt: daysAgo(10) });
    const r = evaluate();
    expect(r.status).toBe('SKIP');
    expect(r.prior_session_id).toBe(recent);
  });

  it('16 — a session for another role is ignored', () => {
    require101();
    addSession({ status: 'scored', outcome: 'pass', scoredAt: daysAgo(10), roleId: 999 });
    const r = evaluate();
    expect(r.status).toBe('ELIGIBLE');
    expect(r.reason).toBe('NO_PRIOR_RECORD');
  });

  it('21 — an inconclusive (voided) outcome does not grant a free pass', () => {
    require101();
    addSession({ status: 'scored', outcome: 'inconclusive', scoredAt: daysAgo(10) });
    const r = evaluate();
    expect(r.status).toBe('PENDING_COOLING');
    expect(r.show_button).toBe(false);
  });
});

describe('settings', () => {
  it('20 — missing settings fail closed with 503, not open', () => {
    require101();
    db.prepare(`DELETE FROM tmext_ai_assessment_settings`).run();
    expect(() => evaluate()).toThrowError(
      expect.objectContaining({ status: 503, code: 'SETTINGS_UNAVAILABLE' }),
    );
  });

  it('a role override beats the global default', () => {
    require101();
    updateSettings(db, 101, { cooling_period_fail_days: 5 }, 'admin');
    addSession({ status: 'scored', outcome: 'fail', scoredAt: daysAgo(10) });
    expect(evaluate().status).toBe('ELIGIBLE'); // 10 days > the 5-day override
  });
});

describe('response shape', () => {
  it('carries the additive fields from docs/05 §12.5', () => {
    require101();
    const r = evaluate();
    expect(r).toMatchObject({
      role_id: 101,
      role_name: 'Retail Officer',
      program_type: 'lateral',
      attempts_used: 0,
      max_attempts: 2,
    });
    expect(r.evaluated_at).toMatch(/Z$/);
    expect(r).toHaveProperty('blueprint_id');
    expect(r).toHaveProperty('estimated_duration_minutes');
  });

  it('writes an audit row for every evaluation', () => {
    require101();
    evaluateEligibility(db, CAND, 101, 'lateral', {});
    const n = db
      .prepare(`SELECT COUNT(*) AS n FROM tmext_ai_assessment_audit WHERE action = 'eligibility.evaluate'`)
      .get() as { n: number };
    expect(n.n).toBe(1);
  });
});
