import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { authenticate, signToken, type Role } from './lib/auth.js';
import { ApiError } from './lib/errors.js';
import { eligibilityRouter } from './routes/eligibility.js';
import { adminRouter } from './routes/admin.js';
import { recruiterRouter } from './routes/recruiter.js';
import { candidateRouter } from './routes/candidate.js';

const BASE = '/ai-assessment/api/v1';

export const createApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  // X-Request-Id is accepted and echoed, and flows into every audit row.
  app.use((req, res, next) => {
    req.requestId = (req.headers['x-request-id'] as string) || randomUUID();
    res.set('X-Request-Id', req.requestId);
    next();
  });

  app.use(authenticate);
  app.get(`${BASE}/health`, (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

  /**
   * Dev-only token mint, so the three persona UIs can be driven without an
   * identity provider. In production these tokens come from ThriveHR SSO.
   */
  app.post(`${BASE}/dev/token`, (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
    const { sub, role, name } = req.body ?? {};
    const roles: Role[] = ['CANDIDATE', 'RECRUITER', 'TA_ADMIN'];
    if (typeof sub !== 'string' || !roles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PRINCIPAL', message: `sub required; role one of ${roles.join(', ')}` },
      });
    }
    res.json({ success: true, data: { token: signToken({ sub, role, name }), sub, role, name } });
  });

  app.use(BASE, eligibilityRouter);
  app.use(`${BASE}/admin`, adminRouter);
  app.use(`${BASE}/recruiter`, recruiterRouter);
  app.use(`${BASE}/candidate`, candidateRouter);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'No such endpoint' },
    });
  });

  // Single error funnel — every failure leaves as the docs/05 §8 envelope.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({
        success: false,
        error: { code: err.code, message: err.message, field: err.field, request_id: req.requestId },
      });
    }
    console.error('[unhandled]', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', request_id: req.requestId },
    });
  });

  return app;
};
