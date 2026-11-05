import { Router } from 'express';

export interface HealthDeps {
  isDbConnected: () => boolean;
}

/** Liveness/readiness probe. Infrastructure only — not a product endpoint. */
export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', db: deps.isDbConnected() ? 'connected' : 'disconnected' });
  });
  return router;
}
