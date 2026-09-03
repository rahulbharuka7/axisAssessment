import { Router } from 'express';
import { getDb } from '../db/index.js';
import { requireRole } from '../lib/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest } from '../lib/errors.js';
import {
  createRequirement,
  deleteRequirement,
  getRequirement,
  listRequirements,
  PROGRAM_TYPES,
  updateRequirement,
} from '../services/requirements.js';
import { listSettings, resolveSettings, updateSettings } from '../services/settings.js';

export const adminRouter = Router();
adminRouter.use(requireRole('TA_ADMIN'));

// ── requirements (docs/05 §7) ───────────────────────────────────────────────

adminRouter.get('/requirements', (req, res) => {
  const { role_id, program_type, required } = req.query;
  const data = listRequirements(getDb(), {
    roleId: role_id ? Number(role_id) : undefined,
    programType: typeof program_type === 'string' ? program_type : undefined,
    required: required === undefined ? undefined : required === 'true',
  });
  res.json({ success: true, data });
});

adminRouter.post('/requirements', (req, res) => {
  const db = getDb();
  const { role_id, role_name, program_type, required } = req.body ?? {};

  if (!Number.isInteger(role_id) || role_id <= 0) {
    throw badRequest('INVALID_ROLE_ID', 'role_id must be a positive integer', 'role_id');
  }
  if (typeof role_name !== 'string' || !role_name.trim()) {
    throw badRequest('MISSING_FIELD', 'role_name is required', 'role_name');
  }
  if (program_type !== null && !PROGRAM_TYPES.includes(program_type)) {
    throw badRequest(
      'INVALID_PROGRAM_TYPE',
      `program_type must be null (all programs) or one of: ${PROGRAM_TYPES.join(', ')}`,
      'program_type',
    );
  }
  if (typeof required !== 'boolean') {
    throw badRequest('MISSING_FIELD', 'required must be a boolean', 'required');
  }

  const data = createRequirement(
    db,
    { role_id, role_name: role_name.trim(), program_type, required },
    req.principal!.sub,
  );
  audit(db, {
    actorType: 'admin',
    actorId: req.principal!.sub,
    action: 'requirements.create',
    entityType: 'requirement',
    entityId: data.id,
    after: data,
    requestId: req.requestId,
  });
  res.status(201).json({ success: true, data });
});

adminRouter.post('/requirements/:id/update', (req, res) => {
  const db = getDb();
  const before = getRequirement(db, req.params.id);
  const data = updateRequirement(db, req.params.id, {
    role_name: req.body?.role_name,
    required: req.body?.required,
  });
  audit(db, {
    actorType: 'admin',
    actorId: req.principal!.sub,
    action: 'requirements.update',
    entityType: 'requirement',
    entityId: data.id,
    before,
    after: data,
    requestId: req.requestId,
  });
  res.json({ success: true, data });
});

adminRouter.post('/requirements/:id/delete', (req, res) => {
  const db = getDb();
  const before = deleteRequirement(db, req.params.id);
  audit(db, {
    actorType: 'admin',
    actorId: req.principal!.sub,
    action: 'requirements.delete',
    entityType: 'requirement',
    entityId: before.id,
    before,
    requestId: req.requestId,
  });
  res.json({ success: true, data: { id: before.id, deleted: true } });
});

// ── settings (docs/05 §7.1) ─────────────────────────────────────────────────

adminRouter.get('/settings', (_req, res) => {
  res.json({ success: true, data: listSettings(getDb()) });
});

adminRouter.post('/settings/update', (req, res) => {
  const db = getDb();
  const before = resolveSettings(db);
  const data = updateSettings(db, null, req.body ?? {}, req.principal!.sub);
  audit(db, {
    actorType: 'admin',
    actorId: req.principal!.sub,
    action: 'settings.update',
    entityType: 'settings',
    entityId: 'global',
    before,
    after: data,
    requestId: req.requestId,
  });
  res.json({ success: true, data });
});

adminRouter.post('/settings/:roleId/update', (req, res) => {
  const db = getDb();
  const roleId = Number(req.params.roleId);
  if (!Number.isInteger(roleId)) throw badRequest('INVALID_ROLE_ID', 'roleId must be an integer');
  const data = updateSettings(db, roleId, req.body ?? {}, req.principal!.sub);
  audit(db, {
    actorType: 'admin',
    actorId: req.principal!.sub,
    action: 'settings.update',
    entityType: 'settings',
    entityId: String(roleId),
    after: data,
    requestId: req.requestId,
  });
  res.json({ success: true, data });
});

// ── audit log (docs/05 §10) ─────────────────────────────────────────────────

adminRouter.get('/audit', (req, res) => {
  const limit = Math.min(Number(req.query.page_size ?? 50), 200);
  const page = Math.max(1, Number(req.query.page ?? 1));
  const action = typeof req.query.action === 'string' ? req.query.action : null;

  const where = action ? `WHERE action = ?` : '';
  const params = action ? [action] : [];
  const total = (
    getDb()
      .prepare(`SELECT COUNT(*) AS n FROM tmext_ai_assessment_audit ${where}`)
      .get(...params) as { n: number }
  ).n;
  const data = getDb()
    .prepare(
      `SELECT * FROM tmext_ai_assessment_audit ${where}
        ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, (page - 1) * limit);

  res.json({ success: true, data, total, page, page_size: limit });
});
