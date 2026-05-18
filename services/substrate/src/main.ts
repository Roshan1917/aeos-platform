import express from 'express';
import { initTracing } from '@aeos/telemetry-sdk';
import { config } from './config.js';
import { healthRouter, setReady } from './health.js';
import { authRouter } from './api/auth.js';
import { tenantsRouter } from './api/tenants.js';
import { usersRouter } from './api/users.js';
import { rbacRouter } from './api/rbac.js';
import { agentsRouter } from './api/agents.js';
import { registryRouter } from './api/registry.js';
import { internalRouter } from './api/internal.js';
import { createDocsRouter } from '@aeos/openapi-helpers';
import { buildRegistry } from './openapi.js';

initTracing(config.SERVICE_NAME);

const app = express();
app.use(express.json());

// Health — no auth
app.use(healthRouter());

// API docs — `/openapi.json` + `/docs`. Open in non-prod, gated in prod.
app.use(
  createDocsRouter({
    title: 'AEOS Substrate',
    version: '0.1.0',
    description: 'Auth, RBAC, Org Management, Agent Identity, and Registry APIs.',
    registry: buildRegistry(),
    servers: [{ url: '/', description: 'Current host' }],
  }),
);

// Public auth endpoints — no JWT required
app.use('/v1/auth', authRouter);

// JWKS endpoint — public, used by services to verify tokens in prod
app.get('/.well-known/jwks.json', (req, res) => {
  // Delegate to the auth router handler (reuse the same logic)
  req.url = '/jwks.json';
  authRouter(req, res, () => {
    res.status(404).json({ error: 'not_found' });
  });
});

// Authenticated API routes
app.use('/v1/tenants', tenantsRouter);
app.use('/v1/users', usersRouter);
app.use('/v1/rbac', rbacRouter);

// Agents + Contracts (mounted under /v1 to support both /v1/agents and /v1/agent-contracts)
app.use('/v1/agents', agentsRouter);
app.use('/v1/agent-contracts', agentsRouter); // agentsRouter handles /contracts/* internally

// Registry proxy (tenant-scoped paths)
app.use('/v1', registryRouter);

// Internal signing — cluster-internal only; ingress must block external access
app.use('/internal/sign', internalRouter);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[substrate] Unhandled error:', err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

const server = app.listen(config.PORT, () => {
  console.log(`[${config.SERVICE_NAME}] listening on :${config.PORT}`);
  setReady(true);
});

process.on('SIGTERM', () => {
  console.log(`[${config.SERVICE_NAME}] SIGTERM received — shutting down`);
  setReady(false);
  server.close(() => {
    console.log(`[${config.SERVICE_NAME}] closed`);
    process.exit(0);
  });
});
