import type { DB } from '../db/index.js';
import { audit } from '../lib/audit.js';
import { nowIso, isoPlusDays, isFuture } from '../lib/time.js';
import { resolveRequirement, type ProgramType } from './requirements.js';
import { resolveSettings } from './settings.js';

export type EligibilityStatus =
  | 'NOT_APPLICABLE'
  | 'SKIP'
  | 'PENDING_COOLING'
  | 'PENDING'
  | 'NOT_ELIGIBLE'
  | 'ELIGIBLE';

export type EligibilityReason =
  | 'ROLE_NOT_REQUIRED'
  | 'PRIOR_PASS_IN_COOLING'
  | 'PRIOR_FAIL_IN_COOLING'
  | 'ATTEMPT_IN_PROGRESS'
  | 'MAX_ATTEMPTS_EXHAUSTED'
  | 'NO_PRIOR_RECORD'
  | 'PRIOR_FAIL_COOLING_EXPIRED'
  | 'PRIOR_PASS_COOLING_EXPIRED';

export interface EligibilityResult {
  role_id: number;
  role_name: string | null;
  program_type: ProgramType;
  status: EligibilityStatus;
  reason: EligibilityReason;
  /** docs/05 invariant 5 — the only field the frontend branches on. */
  show_button: boolean;
  prior_session_id: string | null;
  cooling_ends_at: string | null;
  attempts_used: number;
  max_attempts: number | null;
  blueprint_id: string | null;
  estimated_duration_minutes: number | null;
  evaluated_at: string;
}

interface SessionRow {
  id: string;
  status: string;
  outcome: string | null;
  scored_at: string | null;
  expires_at: string | null;
  blueprint_id: string | null;
}

const ACTIVE_STATUSES = ['in_progress', 'submitted', 'scoring'];

/**
 * Evaluate whether a candidate must take the assessment for a role.
 *
 * Step order matters and is not the order in the source spec — see docs/05 §12.1.
 * The original ran the history check first, asking for a prior *scored* session.
 * A candidate mid-test on their first ever attempt has none, so it returned
 * ELIGIBLE / NO_PRIOR_RECORD and stopped, making ATTEMPT_IN_PROGRESS unreachable
 * for exactly the case it exists to cover — the candidate was shown a second
 * "Start Assessment" button while attempt one was still running.
 */
export const evaluateEligibility = (
  db: DB,
  candidateId: string,
  roleId: number,
  programType: ProgramType,
  ctx: { requestId?: string; skipAudit?: boolean } = {},
): EligibilityResult => {
  const evaluatedAt = nowIso();

  // ── Step 0 — resolve config. Throws 503 if settings are unreachable.
  const settings = resolveSettings(db, roleId);

  const job = db.prepare(`SELECT role_name FROM tmext_job WHERE role_id = ?`).get(roleId) as
    | { role_name: string }
    | undefined;

  const base = {
    role_id: roleId,
    program_type: programType,
    prior_session_id: null as string | null,
    cooling_ends_at: null as string | null,
    blueprint_id: null as string | null,
    estimated_duration_minutes: null as number | null,
    evaluated_at: evaluatedAt,
  };

  const finish = (r: EligibilityResult): EligibilityResult => {
    if (!ctx.skipAudit) {
      audit(db, {
        actorType: 'candidate',
        actorId: candidateId,
        action: 'eligibility.evaluate',
        entityType: 'role',
        entityId: String(roleId),
        after: { status: r.status, reason: r.reason, show_button: r.show_button, program_type: programType },
        requestId: ctx.requestId,
      });
    }
    return r;
  };

  // ── Step 1 — requirements table, most-specific-wins (docs/05 §2.1).
  const requirement = resolveRequirement(db, roleId, programType);
  const roleName = requirement?.role_name ?? job?.role_name ?? null;

  // A miss defaults to NOT_APPLICABLE — fail safe (invariant 3). Never block a
  // candidate because a config row is missing.
  if (!requirement || requirement.required !== 1) {
    return finish({
      ...base,
      role_name: roleName,
      status: 'NOT_APPLICABLE',
      reason: 'ROLE_NOT_REQUIRED',
      show_button: false,
      attempts_used: 0,
      max_attempts: settings.max_attempts,
    });
  }

  const blueprint = db
    .prepare(
      `SELECT id, total_duration_minutes FROM tmext_ai_blueprint
        WHERE role_id = ? AND status = 'published' AND is_deleted = 0
        ORDER BY version DESC LIMIT 1`,
    )
    .get(roleId) as { id: string; total_duration_minutes: number | null } | undefined;

  const withBlueprint = {
    ...base,
    role_name: roleName,
    blueprint_id: blueprint?.id ?? null,
    estimated_duration_minutes: blueprint?.total_duration_minutes ?? null,
  };

  // ── Step 2 — active session, BEFORE history (docs/05 §12.1).
  const active = db
    .prepare(
      `SELECT id, status, outcome, scored_at, expires_at, blueprint_id
         FROM tmext_ai_assessment_sessions
        WHERE candidate_id = ? AND role_id = ? AND is_deleted = 0
          AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get(candidateId, roleId, ...ACTIVE_STATUSES) as SessionRow | undefined;

  if (active) {
    const expired =
      active.status === 'in_progress' &&
      active.expires_at !== null &&
      !isFuture(active.expires_at, evaluatedAt);

    if (!expired) {
      return finish({
        ...withBlueprint,
        status: 'PENDING',
        reason: 'ATTEMPT_IN_PROGRESS',
        show_button: false,
        prior_session_id: active.id,
        attempts_used: countAttempts(db, candidateId, roleId),
        max_attempts: effectiveMaxAttempts(db, candidateId, roleId, settings.max_attempts),
      });
    }

    // Lazy sweep — docs/05 §12.4. Without this, a dead laptop leaves the session
    // in_progress forever and every future call returns PENDING with no button:
    // a permanent, silent block with no self-service recovery.
    db.prepare(
      `UPDATE tmext_ai_assessment_sessions SET status = 'expired', updated_at = ? WHERE id = ?`,
    ).run(evaluatedAt, active.id);
    audit(db, {
      actorType: 'system',
      action: 'session.expire',
      entityType: 'session',
      entityId: active.id,
      after: { reason: 'ttl_elapsed', expires_at: active.expires_at },
      requestId: ctx.requestId,
    });
  }

  // ── Step 3 — history. Only *scored* sessions count.
  const last = db
    .prepare(
      `SELECT id, status, outcome, scored_at, expires_at, blueprint_id
         FROM tmext_ai_assessment_sessions
        WHERE candidate_id = ? AND role_id = ? AND is_deleted = 0
          AND status = 'scored' AND scored_at IS NOT NULL
        ORDER BY scored_at DESC LIMIT 1`,
    )
    .get(candidateId, roleId) as SessionRow | undefined;

  const attemptsUsed = countAttempts(db, candidateId, roleId);
  const maxAttempts = effectiveMaxAttempts(db, candidateId, roleId, settings.max_attempts);

  if (!last) {
    return finish({
      ...withBlueprint,
      status: 'ELIGIBLE',
      reason: 'NO_PRIOR_RECORD',
      show_button: true,
      attempts_used: attemptsUsed,
      max_attempts: maxAttempts,
    });
  }

  // ── Step 4 — outcome + cooling, measured from scored_at (invariant 9).
  //
  // A slow scoring queue must not shorten a lockout or lengthen a carry-forward,
  // which is why submitted_at and started_at are deliberately not used here.
  const passed = last.outcome === 'pass';
  const days = passed ? settings.cooling_period_pass_days : settings.cooling_period_fail_days;
  const coolingEndsAt = isoPlusDays(last.scored_at!, days);
  const inCooling = isFuture(coolingEndsAt, evaluatedAt);

  // An 'inconclusive' outcome (a voided or fraud-flagged session) is not a valid
  // result in either direction. Treat it as a fail for cooling purposes so a
  // recruiter decides, rather than silently granting a retry.
  if (inCooling) {
    return finish({
      ...withBlueprint,
      status: passed ? 'SKIP' : 'PENDING_COOLING',
      reason: passed ? 'PRIOR_PASS_IN_COOLING' : 'PRIOR_FAIL_IN_COOLING',
      show_button: false,
      prior_session_id: last.id,
      cooling_ends_at: coolingEndsAt,
      attempts_used: attemptsUsed,
      max_attempts: maxAttempts,
    });
  }

  // ── Step 5 — attempt budget (docs/05 §12.2).
  //
  // Checked only once cooling has expired, i.e. only on the branches that would
  // hand the candidate a NEW attempt. Ordering it earlier is wrong: a candidate
  // whose most recent result is a pass inside its carry-forward window would be
  // reported NOT_ELIGIBLE / MAX_ATTEMPTS_EXHAUSTED, blocking someone who already
  // passed. The budget caps retries; it does not invalidate a valid result.
  if (maxAttempts !== null && attemptsUsed >= maxAttempts) {
    return finish({
      ...withBlueprint,
      status: 'NOT_ELIGIBLE',
      reason: 'MAX_ATTEMPTS_EXHAUSTED',
      show_button: false,
      prior_session_id: last.id,
      attempts_used: attemptsUsed,
      max_attempts: maxAttempts,
    });
  }

  return finish({
    ...withBlueprint,
    status: 'ELIGIBLE',
    reason: passed ? 'PRIOR_PASS_COOLING_EXPIRED' : 'PRIOR_FAIL_COOLING_EXPIRED',
    show_button: true,
    prior_session_id: last.id,
    attempts_used: attemptsUsed,
    max_attempts: maxAttempts,
  });
};

/** Scored attempts to date for this candidate + role. */
const countAttempts = (db: DB, candidateId: string, roleId: number): number => {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM tmext_ai_assessment_sessions
        WHERE candidate_id = ? AND role_id = ? AND is_deleted = 0 AND status = 'scored'`,
    )
    .get(candidateId, roleId) as { n: number };
  return row.n;
};

/**
 * The configured ceiling plus any recruiter-granted exceptions (docs/05 §7.2),
 * so a genuine power cut has a supported path that is not "an admin edits
 * global config".
 */
const effectiveMaxAttempts = (
  db: DB,
  candidateId: string,
  roleId: number,
  configured: number | null,
): number | null => {
  if (configured === null) return null;
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM tmext_ai_attempt_grant
        WHERE candidate_id = ? AND role_id = ? AND is_deleted = 0`,
    )
    .get(candidateId, roleId) as { n: number };
  return configured + row.n;
};
