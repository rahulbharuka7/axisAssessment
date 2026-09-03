import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthenticated } from './errors.js';

export type Role = 'CANDIDATE' | 'RECRUITER' | 'TA_ADMIN';

export interface Principal {
  sub: string;
  role: Role;
  name?: string;
}

const SECRET = process.env.JWT_SECRET ?? 'dev-only-secret-change-in-production';
const TTL = process.env.JWT_TTL ?? '12h';

export const signToken = (p: Principal): string =>
  jwt.sign(p, SECRET, { expiresIn: TTL } as jwt.SignOptions);

export const verifyToken = (token: string): Principal => {
  try {
    return jwt.verify(token, SECRET) as Principal;
  } catch {
    throw unauthenticated('Token is missing, malformed or expired');
  }
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal;
      requestId?: string;
    }
  }
}

/** Populates req.principal when a bearer token is present. Does not enforce. */
export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    req.principal = verifyToken(header.slice(7).trim());
  }
  next();
};

/**
 * Enforces that the caller holds one of `roles`.
 *
 * Distinguishes 401 from 403 deliberately: "you are not signed in" and "you are
 * signed in as the wrong persona" need different fixes from the caller.
 */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.principal) return next(unauthenticated());
    if (!roles.includes(req.principal.role)) {
      return next(forbidden(`This endpoint requires: ${roles.join(' or ')}`));
    }
    next();
  };
