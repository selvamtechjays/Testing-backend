import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createAuthRouter } from './routes/auth.js';
import { createHealthRouter, type HealthDeps } from './routes/health.js';

export const API_PREFIX = '/api';

export interface AppDeps extends HealthDeps {
  /** Time source for session creation; defaults to the real clock. */
  clock?: () => Date;
  /** Adds `Secure` to the session cookie; true in production. */
  secureCookies?: boolean;
}

/** Builds the Express app without opening a port or a DB connection, so tests can drive it with supertest. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());
  app.use(API_PREFIX, createHealthRouter(deps));
  app.use(
    API_PREFIX,
    createAuthRouter({
      clock: deps.clock ?? (() => new Date()),
      secureCookies: !!deps.secureCookies,
    }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
