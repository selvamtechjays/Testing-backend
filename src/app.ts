import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createStaticFrontend } from './middleware/staticFrontend.js';
import { createAuthRouter } from './routes/auth.js';
import { createHealthRouter, type HealthDeps } from './routes/health.js';
import { createTasksRouter } from './routes/tasks.js';

export const API_PREFIX = '/api';

export interface AppDeps extends HealthDeps {
  /** Time source for session creation; defaults to the real clock. */
  clock?: () => Date;
  /** Adds `Secure` to the session cookie; true in production. */
  secureCookies?: boolean;
  /** Trust one reverse proxy hop (the host's router) so client protocol and address are read correctly. */
  trustProxy?: boolean;
  /** Directory of the built frontend to serve beside the API; omitted means no static handler. */
  frontendDistDir?: string;
}

/** Builds the Express app without opening a port or a DB connection, so tests can drive it with supertest. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  const clock = deps.clock ?? (() => new Date());
  if (deps.trustProxy) app.set('trust proxy', 1);
  app.use(express.json());
  app.use(API_PREFIX, createHealthRouter(deps));
  app.use(
    API_PREFIX,
    createAuthRouter({
      clock,
      secureCookies: !!deps.secureCookies,
    }),
  );
  app.use(API_PREFIX, createTasksRouter({ clock }));
  if (deps.frontendDistDir) app.use(createStaticFrontend(deps.frontendDistDir, API_PREFIX));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
