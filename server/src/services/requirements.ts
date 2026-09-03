import type { DB } from '../db/index.js';
import { conflict, notFound } from '../lib/errors.js';
import { uuid } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';

export const PROGRAM_TYPES = ['lateral', 'campus', 'referral', 'vendor', 'job_portal'] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export interface Requirement {
  id: string;
  role_id: number;
  role_name: string;
  program_type: ProgramType | null;
  required: number;
  created_by: string | null;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}

/**
 * docs/05 §2.1 — most specific wins.
 *
 *   1. exact (role_id, program_type)
 *   2. wildcard (role_id, program_type IS NULL)
 *   3. neither -> undefined, which the caller treats as NOT_APPLICABLE (invariant 3)
 *
 * Leaving this ambiguous is a live production bug: with both rows present, an
 * arbitrary row order silently decides whether a candidate is assessed.
 */
export const resolveRequirement = (
  db: DB,
  roleId: number,
  programType: ProgramType,
): Requirement | undefined => {
  const exact = db
    .prepare(
      `SELECT * FROM tmext_ai_assessment_requirements
        WHERE role_id = ? AND program_type = ? AND is_deleted = 0`,
    )
    .get(roleId, programType) as Requirement | undefined;
  if (exact) return exact;

  return db
    .prepare(
      `SELECT * FROM tmext_ai_assessment_requirements
        WHERE role_id = ? AND program_type IS NULL AND is_deleted = 0`,
    )
    .get(roleId) as Requirement | undefined;
};

export const listRequirements = (
  db: DB,
  filter: { roleId?: number; programType?: string; required?: boolean } = {},
): Requirement[] => {
  const where = ['is_deleted = 0'];
  const params: unknown[] = [];
  if (filter.roleId !== undefined) {
    where.push('role_id = ?');
    params.push(filter.roleId);
  }
  if (filter.programType !== undefined) {
    where.push('program_type = ?');
    params.push(filter.programType);
  }
  if (filter.required !== undefined) {
    where.push('required = ?');
    params.push(filter.required ? 1 : 0);
  }
  return db
    .prepare(
      `SELECT * FROM tmext_ai_assessment_requirements
        WHERE ${where.join(' AND ')}
        ORDER BY role_id, (program_type IS NULL), program_type`,
    )
    .all(...params) as Requirement[];
};

export interface RequirementInput {
  role_id: number;
  role_name: string;
  program_type: ProgramType | null;
  required: boolean;
}

export const createRequirement = (
  db: DB,
  input: RequirementInput,
  createdBy: string,
): Requirement => {
  const existing = db
    .prepare(
      input.program_type === null
        ? `SELECT id FROM tmext_ai_assessment_requirements
             WHERE role_id = ? AND program_type IS NULL AND is_deleted = 0`
        : `SELECT id FROM tmext_ai_assessment_requirements
             WHERE role_id = ? AND program_type = ? AND is_deleted = 0`,
    )
    .get(...(input.program_type === null ? [input.role_id] : [input.role_id, input.program_type]));

  if (existing) {
    throw conflict(
      'REQUIREMENT_EXISTS',
      `A rule already exists for role ${input.role_id} / ${input.program_type ?? 'all programs'}`,
    );
  }

  const now = nowIso();
  const row: Requirement = {
    id: uuid(),
    role_id: input.role_id,
    role_name: input.role_name,
    program_type: input.program_type,
    required: input.required ? 1 : 0,
    created_by: createdBy,
    is_deleted: 0,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO tmext_ai_assessment_requirements
       (id, role_id, role_name, program_type, required, created_by, is_deleted, created_at, updated_at)
     VALUES (@id, @role_id, @role_name, @program_type, @required, @created_by, 0, @created_at, @updated_at)`,
  ).run(row);
  return row;
};

export const getRequirement = (db: DB, id: string): Requirement => {
  const row = db
    .prepare(`SELECT * FROM tmext_ai_assessment_requirements WHERE id = ? AND is_deleted = 0`)
    .get(id) as Requirement | undefined;
  if (!row) throw notFound('REQUIREMENT_NOT_FOUND', `No requirement with id ${id}`);
  return row;
};

export const updateRequirement = (
  db: DB,
  id: string,
  patch: Partial<Pick<RequirementInput, 'role_name' | 'required'>>,
): Requirement => {
  const before = getRequirement(db, id);
  db.prepare(
    `UPDATE tmext_ai_assessment_requirements
        SET role_name = @role_name, required = @required, updated_at = @updated_at
      WHERE id = @id`,
  ).run({
    id,
    role_name: patch.role_name ?? before.role_name,
    required: patch.required === undefined ? before.required : patch.required ? 1 : 0,
    updated_at: nowIso(),
  });
  return getRequirement(db, id);
};

export const deleteRequirement = (db: DB, id: string): Requirement => {
  const before = getRequirement(db, id);
  db.prepare(
    `UPDATE tmext_ai_assessment_requirements SET is_deleted = 1, updated_at = ? WHERE id = ?`,
  ).run(nowIso(), id);
  return before;
};
