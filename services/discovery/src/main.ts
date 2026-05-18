import express from 'express';
import { requireAuth } from '@aeos/auth-client';
import { config } from './config.js';
import { healthRouter, setReady } from './health.js';
import { connectorsRouter } from './api/connectors.js';
import { connectorDocumentsRouter } from './api/connector-documents.js';
import { runsRouter, connectorRunRouter } from './api/runs.js';
import { suggestionsRouter, runSuggestionsRouter } from './api/suggestions.js';
import { closeRedis } from './lib/redis.js';
import { createDocsRouter } from '@aeos/openapi-helpers';
import { buildRegistry } from './openapi.js';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(healthRouter());

// API docs — `/openapi.json` + `/docs`. Mounted at root so they sit
// outside the `/v1` requireAuth gate (schema is metadata, not tenant data).
app.use(
  createDocsRouter({
    title: 'AEOS Discovery',
    version: '0.1.0',
    description: 'LLM-driven business process discovery from uploaded documents.',
    registry: buildRegistry(),
    servers: [{ url: '/', description: 'Current host' }],
  }),
);

// Auth applied to all /v1 routes below.
app.use('/v1', requireAuth());

app.use('/v1/discovery/connectors', connectorsRouter);
app.use('/v1/discovery/connectors', connectorDocumentsRouter);
app.use('/v1/discovery/connectors', connectorRunRouter); // POST /:id/run
app.use('/v1/discovery/runs', runsRouter);
app.use('/v1/discovery/runs', runSuggestionsRouter);
app.use('/v1/discovery/suggestions', suggestionsRouter);

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

async function shutdown(signal: string): Promise<void> {
  console.log(`[${config.SERVICE_NAME}] ${signal} — shutting down`);
  setReady(false);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeRedis();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
