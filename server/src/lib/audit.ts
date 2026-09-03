import type { DB } from '../db/index.js';
import { uuid } from './ids.js';
import { nowIso } from './time.js';

export interface AuditEntry {
  actorType: 'candidate' | 'recruiter' | 'admin' | 'system';
  actorId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
}

/**
 * docs/05 §10 — every eligibility evaluation and admin mutation is recorded.
 *
 * Evaluations are audited because "why was this candidate skipped?" is a question
 * compliance will eventually ask, and reconstructing it from settings that have
 * since changed is otherwise impossible.
 */
export const audit = (db: DB, e: AuditEntry): void => {
  db.prepare(
    `INSERT INTO tmext_ai_assessment_audit
       (id, actor_type, actor_id, action, entity_type, entity_id,
        before, after, request_id, created_at)
     VALUES (@id, @actorType, @actorId, @action, @entityType, @entityId,
             @before, @after, @requestId, @createdAt)`,
  ).run({
    id: uuid(),
    actorType: e.actorType,
    actorId: e.actorId ?? null,
    action: e.action,
    entityType: e.entityType ?? null,
    entityId: e.entityId ?? null,
    before: e.before === undefined ? null : JSON.stringify(e.before),
    after: e.after === undefined ? null : JSON.stringify(e.after),
    requestId: e.requestId ?? null,
    createdAt: nowIso(),
  });
};
