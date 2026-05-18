import type { Router } from 'express';
import { Router as createRouter } from 'express';

let ready = false;

export function setReady(value: boolean): void {
  ready = value;
}

export function healthRouter(): Router {
  const router = createRouter();

  router.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  router.get('/readyz', (_req, res) => {
    if (ready) {
      res.status(200).json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not_ready' });
    }
  });

  return router;
}
