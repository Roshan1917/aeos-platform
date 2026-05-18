import express from 'express';
import { requireAuth } from '@aeos/auth-client';
import { initTracing } from '@aeos/telemetry-sdk';
import { config } from './config.js';
import { healthRouter, setReady } from './health.js';

initTracing(config.SERVICE_NAME);

const app = express();
app.use(express.json());
app.use(healthRouter());

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
