import { Router } from 'express';
import { getDb } from '../db/index.js';
import { requireRole } from '../lib/auth.js';
import { badRequest, notFound } from '../lib/errors.js';
import { evaluateEligibility } from '../services/eligibility.js';
import { PROGRAM_TYPES, type ProgramType } from '../services/requirements.js';

export const eligibilityRouter = Router();

/**
 * POST /ai-assessment/api/v1/eligibility  — docs/05 §3
 *
 * The ATS calls this when a candidate reaches Shortlisted. It answers a question;
 * it does not write to the ATS (invariant 6).
 */
eligibilityRouter.post('/eligibility', requireRole('CANDIDATE'), (req, res) => {
  const db = getDb();
  const body = req.body ?? {};

  // Invariant 1, enforced rather than assumed. Silently dropping a supplied
  // candidate_id would let a caller believe impersonation had worked.
  if ('candidate_id' in body) {
    throw badRequest(
      'CANDIDATE_ID_NOT_ACCEPTED',
      'candidate_id is taken from the JWT and must not be sent in the body',
      'candidate_id',
    );
  }

  const { role_id, program_type } = body;

  if (role_id === undefined || role_id === null) {
    throw badRequest('MISSING_FIELD', 'role_id is required', 'role_id');
  }
  if (!Number.isInteger(role_id) || role_id <= 0) {
    throw badRequest('INVALID_ROLE_ID', 'role_id must be a positive integer', 'role_id');
  }
  if (program_type === undefined || program_type === null) {
    throw badRequest('MISSING_FIELD', 'program_type is required', 'program_type');
  }
  if (!PROGRAM_TYPES.includes(program_type)) {
    throw badRequest(
      'INVALID_PROGRAM_TYPE',
      `program_type must be one of: ${PROGRAM_TYPES.join(', ')}`,
      'program_type',
    );
  }

  const job = db.prepare(`SELECT 1 FROM tmext_job WHERE role_id = ?`).get(role_id);
  if (!job) throw notFound('ROLE_NOT_FOUND', `No role with id ${role_id}`);

  const data = evaluateEligibility(
    db,
    req.principal!.sub,
    role_id,
    program_type as ProgramType,
    { requestId: req.requestId },
  );

  // A point-in-time decision — never cached by a browser or CDN (docs/05 §9.5).
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data });
});
