/**
 * POST /v1/auth/token   — issue JWT from email+password
 * POST /v1/auth/refresh — refresh access token using refresh token
 * GET  /.well-known/jwks.json — public JWKS (for RS256 prod verification)
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { signAccessToken, signRefreshToken, verifyToken } from '../lib/jwt.js';
import { config } from '../config.js';

export const authRouter = Router();

// ── POST /v1/auth/token ───────────────────────────────────────────────────────

const tokenSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenant_slug: z.string().min(1),
});

authRouter.post('/token', async (req, res) => {
  const body = tokenSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'invalid_request', details: body.error.flatten() });
    return;
  }

  const { email, password, tenant_slug } = body.data;

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenant_slug } });
  if (!tenant || tenant.status !== 'active') {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email } },
  });
  if (!user || user.status !== 'active') {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  const accessToken = signAccessToken({
    sub: user.id,
    tenant_id: tenant.id,
    roles: user.roles,
  });

  const refreshToken = signRefreshToken(user.id, tenant.id);
  const expiresAt = new Date(Date.now() + config.AUTH_REFRESH_EXPIRY_SECONDS * 1000);

  // Persist refresh token
  await prisma.session.create({
    data: {
      userId: user.id,
      tenantId: tenant.id,
      refreshToken,
      expiresAt,
    },
  });

  res.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: config.AUTH_JWT_EXPIRY_SECONDS,
  });
});

// ── POST /v1/auth/refresh ─────────────────────────────────────────────────────

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

// ── GET /.well-known/jwks.json ────────────────────────────────────────────────
// Mounted on authRouter but exposed at the top-level path in main.ts.
//
// In HS256 mode (local dev, SIGNING_PRIVATE_KEY_B64 not set): returns empty
// key set — callers must use AUTH_JWT_SECRET directly.
//
// In RS256/Ed25519 mode (prod): returns the platform's public signing key as a
// JWK so that services can verify tokens without the private key.

authRouter.get('/jwks.json', (_req, res) => {
  const privateKeyB64 = config.SIGNING_PRIVATE_KEY_B64;

  if (!privateKeyB64) {
    // HMAC mode — no public keys to advertise
    res.json({ keys: [] });
    return;
  }

  try {
    const privateKeyDer = Buffer.from(privateKeyB64, 'base64');
    const privateKey = crypto.createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
    const publicKey = crypto.createPublicKey(privateKey);
    const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;

    // Add standard metadata fields
    const signingJwk: Record<string, unknown> = {
      ...jwk,
      use: 'sig',
      alg: 'EdDSA',
      kid: 'aeos-platform-signing-key-v1',
    };

    res.json({ keys: [signingJwk] });
  } catch (err) {
    console.error('[substrate] Failed to export signing public key:', err);
    res.status(500).json({ error: 'key_export_failed' });
  }
});

// ── POST /v1/auth/refresh ─────────────────────────────────────────────────────

authRouter.post('/refresh', async (req, res) => {
  const body = refreshSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  let payload: ReturnType<typeof verifyToken>;
  try {
    payload = verifyToken(body.data.refresh_token);
  } catch {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  if (payload.type !== 'refresh') {
    res.status(401).json({ error: 'invalid_token_type' });
    return;
  }

  const session = await prisma.session.findUnique({
    where: { refreshToken: body.data.refresh_token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    res.status(401).json({ error: 'invalid_or_expired_token' });
    return;
  }

  if (session.user.status !== 'active') {
    res.status(401).json({ error: 'user_suspended' });
    return;
  }

  // Rotate refresh token
  const newRefreshToken = signRefreshToken(session.userId, session.tenantId);
  const newExpiresAt = new Date(Date.now() + config.AUTH_REFRESH_EXPIRY_SECONDS * 1000);

  await prisma.session.update({
    where: { id: session.id },
    data: { refreshToken: newRefreshToken, expiresAt: newExpiresAt },
  });

  const accessToken = signAccessToken({
    sub: session.userId,
    tenant_id: session.tenantId,
    roles: session.user.roles,
  });

  res.json({
    access_token: accessToken,
    refresh_token: newRefreshToken,
    token_type: 'Bearer',
    expires_in: config.AUTH_JWT_EXPIRY_SECONDS,
  });
});
