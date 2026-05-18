import express from 'express';
import { requireAuth } from '@aeos/auth-client';
import { initTracing } from '@aeos/telemetry-sdk';
import { config } from './config.js';
import { healthRouter, setReady } from './health.js';
import { generateRouter } from './api/generate.js';
import { testCasesRouter } from './api/test-cases.js';
import { executeRouter } from './api/execute.js';
import { createDocsRouter } from '@aeos/openapi-helpers';
import { buildRegistry } from './openapi.js';

initTracing(config.SERVICE_NAME);

const app = express();
app.use(express.json({ limit: '512kb' }));
app.use(healthRouter());

// API docs — `/openapi.json` + `/docs`. Mount before requireAuth so the
// schema metadata stays browsable without a JWT in non-prod.
app.use(
  createDocsRouter({
    title: 'AEOS Test-Case Generator',
    version: '0.1.0',
    description: 'Internal LLM-driven generator + executor for synthetic AEOS agent traces.',
    registry: buildRegistry(),
    servers: [{ url: '/', description: 'Current host' }],
  }),
);

// All routes below require a valid AEOS JWT (substrate-issued).
app.use(requireAuth());

// /v1/test-cases — generate (LLM), CRUD
app.use('/v1/test-cases', generateRouter);
app.use('/v1/test-cases', testCasesRouter);

// /v1/test-cases/:id/execute, /v1/runs/* — execution + SSE + human decisions
app.use('/v1', executeRouter);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(`[${config.SERVICE_NAME}] unhandled error:`, err);
    res.status(500).json({ error: 'internal_error', message: err.message });
  },
);

const server = app.listen(config.PORT, () => {
  console.log(`[${config.SERVICE_NAME}] listening on :${config.PORT}`);
  setReady(true);
});

process.on('SIGTERM', () => {
  console.log(`[${config.SERVICE_NAME}] SIGTERM — shutting down`);
  setReady(false);
  server.close(() => process.exit(0));
});
