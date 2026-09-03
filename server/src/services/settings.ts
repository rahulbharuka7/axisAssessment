import type { DB } from '../db/index.js';
import { unavailable } from '../lib/errors.js';
import { nowIso } from '../lib/time.js';

export interface Settings {
  id: string;
  role_id: number | null;
  cooling_period_pass_days: number;
  cooling_period_fail_days: number;
  max_attempts: number | null;
  score_policy: 'best' | 'latest' | 'average';
  session_ttl_minutes: number;
  recording_retention_days: number;
  id_image_retention_days: number;
  answer_retention_days: number;
  result_visibility: 'none' | 'basic' | 'detailed';
  updated_by: string | null;
  updated_at: string;
}

/**
 * Resolve effective settings: the role-scoped row if one exists, else global.
 *
 * Throws 503 rather than falling back to defaults when no global row exists.
 * docs/05 §8 — a requirements *miss* is a legitimate "not required" answer, but
 * missing settings mean we cannot compute a cooling window at all, and guessing
 * risks letting a candidate re-test inside a lockout.
 */
export const resolveSettings = (db: DB, roleId?: number): Settings => {
  if (roleId !== undefined) {
    const scoped = db
      .prepare(`SELECT * FROM tmext_ai_assessment_settings WHERE role_id = ?`)
      .get(roleId) as Settings | undefined;
    if (scoped) return scoped;
  }
  const global = db
    .prepare(`SELECT * FROM tmext_ai_assessment_settings WHERE role_id IS NULL`)
    .get() as Settings | undefined;
  if (!global) {
    throw unavailable('SETTINGS_UNAVAILABLE', 'Assessment settings are not configured');
  }
  return global;
};

export const listSettings = (db: DB): Settings[] =>
  db
    .prepare(
      `SELECT * FROM tmext_ai_assessment_settings
        ORDER BY (role_id IS NOT NULL), role_id`,
    )
    .all() as Settings[];

const WRITABLE = [
  'cooling_period_pass_days',
  'cooling_period_fail_days',
  'max_attempts',
  'score_policy',
  'session_ttl_minutes',
  'recording_retention_days',
  'id_image_retention_days',
  'answer_retention_days',
  'result_visibility',
] as const;

export type SettingsPatch = Partial<Pick<Settings, (typeof WRITABLE)[number]>>;

export const updateSettings = (
  db: DB,
  roleId: number | null,
  patch: SettingsPatch,
  updatedBy: string,
): Settings => {
  const fields = WRITABLE.filter((k) => patch[k] !== undefined);
  if (fields.length === 0) return resolveSettings(db, roleId ?? undefined);

  const where = roleId === null ? 'role_id IS NULL' : 'role_id = @role_id';
  const set = fields.map((f) => `${f} = @${f}`).join(', ');
  const params: Record<string, unknown> = { role_id: roleId, updated_by: updatedBy, updated_at: nowIso() };
  for (const f of fields) params[f] = patch[f];

  const res = db
    .prepare(
      `UPDATE tmext_ai_assessment_settings
          SET ${set}, updated_by = @updated_by, updated_at = @updated_at
        WHERE ${where}`,
    )
    .run(params);

  if (res.changes === 0 && roleId !== null) {
    // Upsert a role override on first write.
    const base = resolveSettings(db);
    db.prepare(
      `INSERT INTO tmext_ai_assessment_settings
         (id, role_id, cooling_period_pass_days, cooling_period_fail_days, max_attempts,
          score_policy, session_ttl_minutes, recording_retention_days,
          id_image_retention_days, answer_retention_days, result_visibility,
          updated_by, updated_at)
       VALUES (@id, @role_id, @pass, @fail, @max, @policy, @ttl, @rec, @idr, @ans, @vis, @by, @at)`,
    ).run({
      id: `settings-role-${roleId}`,
      role_id: roleId,
      pass: patch.cooling_period_pass_days ?? base.cooling_period_pass_days,
      fail: patch.cooling_period_fail_days ?? base.cooling_period_fail_days,
      max: patch.max_attempts !== undefined ? patch.max_attempts : base.max_attempts,
      policy: patch.score_policy ?? base.score_policy,
      ttl: patch.session_ttl_minutes ?? base.session_ttl_minutes,
      rec: patch.recording_retention_days ?? base.recording_retention_days,
      idr: patch.id_image_retention_days ?? base.id_image_retention_days,
      ans: patch.answer_retention_days ?? base.answer_retention_days,
      vis: patch.result_visibility ?? base.result_visibility,
      by: updatedBy,
      at: nowIso(),
    });
  }
  return resolveSettings(db, roleId ?? undefined);
};
