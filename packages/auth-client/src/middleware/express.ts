/**
 * Express middleware for AEOS JWT authentication.
 *
 * Mode selection (checked in order):
 *   1. AUTH_JWKS_URI is set  → fetch JWKS from substrate, verify RS256/ES256 (production)
 *   2. AUTH_JWT_SECRET is set → verify HS256 directly (local dev)
 *
 * The substrate exposes GET /.well-known/jwks.json.  Set AUTH_JWKS_URI to
 * <AUTH_SERVICE_URL>/.well-known/jwks.json in non-local environments.
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AeosJwtPayload, AuthContext } from '../types.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

// ── JWKS cache ────────────────────────────────────────────────────────────────

const JWKS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

interface JwkEntry {
  kid?: string;
  kty: string;
  [k: string]: unknown;
}

interface JwksCache {
  keys: JwkEntry[];
  fetchedAt: number;
}

const jwksCache = new Map<string, JwksCache>();

async function fetchJwks(jwksUri: string): Promise<JwkEntry[]> {
  const cached = jwksCache.get(jwksUri);
  if (cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.keys;
  }
  const res = await fetch(jwksUri, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status} ${jwksUri}`);
  const body = (await res.json()) as { keys?: JwkEntry[] };
  const keys = body.keys ?? [];
  jwksCache.set(jwksUri, { keys, fetchedAt: Date.now() });
  return keys;
}

async function getPublicKey(
  jwksUri: string,
  kid: string | undefined,
): Promise<crypto.KeyObject> {
  const keys = await fetchJwks(jwksUri);
  const key = kid ? keys.find((k) => k.kid === kid) : keys[0];
  if (!key) {
    // Stale cache — force refresh once
    jwksCache.delete(jwksUri);
    const fresh = await fetchJwks(jwksUri);
    const retried = kid ? fresh.find((k) => k.kid === kid) : fresh[0];
    if (!retried) throw new Error(`No matching JWKS key (kid=${kid})`);
    return crypto.createPublicKey({ key: retried as crypto.JsonWebKey, format: 'jwk' });
  }
  return crypto.createPublicKey({ key: key as crypto.JsonWebKey, format: 'jwk' });
}

// ── Middleware factory ────────────────────────────────────────────────────────

export interface RequireAuthOptions {
  /**
   * JWKS endpoint URI. Overrides AUTH_JWKS_URI env var.
   * Example: 'https://substrate.internal/.well-known/jwks.json'
   */
  jwksUri?: string;
}

export function requireAuth(options: RequireAuthOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'missing_token', message: 'Authorization header required' });
      return;
    }
    const token = authHeader.slice(7);

    const jwksUri = options.jwksUri ?? process.env['AUTH_JWKS_URI'];
    const hmacSecret = process.env['AUTH_JWT_SECRET'];

    try {
      let payload: AeosJwtPayload;

      if (jwksUri) {
        // ── Production: JWKS (RS256 / ES256) ──────────────────────────────────
        // Decode header to get kid without verifying signature
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || typeof decoded === 'string') {
          res.status(401).json({ error: 'invalid_token', message: 'Malformed JWT' });
          return;
        }
        const kid = (decoded.header as { kid?: string }).kid;
        const publicKey = await getPublicKey(jwksUri, kid);
        payload = jwt.verify(token, publicKey, {
          algorithms: ['RS256', 'ES256'],
        }) as AeosJwtPayload;
      } else if (hmacSecret) {
        // ── Local dev: HS256 ──────────────────────────────────────────────────
        payload = jwt.verify(token, hmacSecret, { algorithms: ['HS256'] }) as AeosJwtPayload;
      } else {
        next(new Error('Auth not configured: set AUTH_JWKS_URI (prod) or AUTH_JWT_SECRET (dev)'));
        return;
      }

      req.auth = {
        userId: payload.sub,
        tenantId: payload.tenant_id,
        roles: payload.roles,
        agentContractId: payload.agent_contract_id,
      };
      next();
    } catch (err) {
      if (err instanceof Error && err.name === 'TokenExpiredError') {
        res.status(401).json({ error: 'token_expired', message: 'Token has expired' });
      } else {
        res.status(401).json({ error: 'invalid_token', message: 'Token invalid or expired' });
      }
    }
  };
}
