import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AeosJwtPayload {
  sub: string;        // userId
  tenant_id: string;
  roles: string[];
  agent_contract_id?: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

export function signAccessToken(payload: Omit<AeosJwtPayload, 'type' | 'iat' | 'exp'>): string {
  return jwt.sign(
    { ...payload, type: 'access' },
    config.AUTH_JWT_SECRET,
    { expiresIn: config.AUTH_JWT_EXPIRY_SECONDS },
  );
}

export function signRefreshToken(userId: string, tenantId: string): string {
  return jwt.sign(
    { sub: userId, tenant_id: tenantId, type: 'refresh' },
    config.AUTH_JWT_SECRET,
    { expiresIn: config.AUTH_REFRESH_EXPIRY_SECONDS },
  );
}

export function verifyToken(token: string): AeosJwtPayload {
  return jwt.verify(token, config.AUTH_JWT_SECRET) as AeosJwtPayload;
}

/** Express middleware — validates access token, populates req.substrateAuth */
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      substrateAuth?: AeosJwtPayload;
    }
  }
}

export function requireAccessToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing_token' });
    return;
  }
  try {
    const payload = verifyToken(header.slice(7));
    if (payload.type !== 'access') {
      res.status(401).json({ error: 'invalid_token_type' });
      return;
    }
    req.substrateAuth = payload;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

/** Admin-only guard — caller must be a platform super-admin (no tenant scope). */
export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  requireAccessToken(req, res, () => {
    if (!req.substrateAuth?.roles.includes('platform_admin')) {
      res.status(403).json({ error: 'forbidden', message: 'platform_admin role required' });
      return;
    }
    next();
  });
}
