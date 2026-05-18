import { describe, expect, it, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { healthRouter, setReady } from '../../src/health.js';

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

function startApp(): Promise<string> {
  const app = express();
  app.use(healthRouter());
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = (server!.address() as AddressInfo).port;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

describe('health endpoints', () => {
  it('GET /healthz returns 200 + status:ok', async () => {
    const base = await startApp();
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('GET /readyz returns 503 when not ready', async () => {
    setReady(false);
    const base = await startApp();
    const res = await fetch(`${base}/readyz`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'not_ready' });
  });

  it('GET /readyz returns 200 once setReady(true)', async () => {
    setReady(true);
    const base = await startApp();
    const res = await fetch(`${base}/readyz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ready' });
  });
});
