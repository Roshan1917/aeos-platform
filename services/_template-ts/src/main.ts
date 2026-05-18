import express from 'express';
import { requireAuth } from '@aeos/auth-client';
import { createDocsRouter, OpenAPIRegistry, SECURITY_SCHEMES } from '@aeos/openapi-helpers';
import { initTracing } from '@aeos/telemetry-sdk';
import { config } from './config.js';
import { healthRouter, setReady } from './health.js';

initTracing(config.SERVICE_NAME);

const app = express();
app.use(express.json());
app.use(healthRouter());

// API docs — `/openapi.json` + `/docs`. Register your routes against this
// registry as you add them; the spec is hand-curated, not auto-extracted.
// See services/substrate/src/openapi.ts for a fully-populated example.
const openapi = new OpenAPIRegistry();
openapi.registerComponent('securitySchemes', 'bearerJwt', SECURITY_SCHEMES.bearerJwt);
app.use(
  createDocsRouter({
    title: config.SERVICE_NAME,
    version: '0.1.0',
    registry: openapi,
    servers: [{ url: '/', description: 'Current host' }],
  }),
);

// All routes below this line require authentication
app.use(requireAuth());

// TODO: mount your service routes here
// import { myRouter } from './api/my-router.js';
// app.use('/v1', myRouter);

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
