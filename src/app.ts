import express, { type Express } from 'express';
import { createAuthThrottle, type AuthThrottle } from './auth/authThrottle.js';
import { createHashGate, type HashGate } from './auth/hashGate.js';
import { createLogger, type Logger } from './lib/logger.js';
import { createAccessLog } from './middleware/accessLog.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRequestId } from './middleware/requestId.js';
import { createSecurityHeaders } from './middleware/securityHeaders.js';
import { createStaticFrontend } from './middleware/staticFrontend.js';
import { createAuthRouter } from './routes/auth.js';
import { createHealthRouter, type HealthDeps } from './routes/health.js';
import { createTagsRouter } from './routes/tags.js';
import { createTasksRouter } from './routes/tasks.js';

export const API_PREFIX = '/api';

export interface AppDeps extends HealthDeps {
  /** Time source for session creation; defaults to the real clock. */
  clock?: () => Date;
  /** Adds `Secure` to the session cookie and Strict-Transport-Security to responses; true in production. */
  secureCookies?: boolean;
  /** Reverse proxies in front of the app whose forwarded address is trusted (DEC-306); 0 or omitted trusts none. */
  trustProxyHops?: number;
  /** Directory of the built frontend to serve beside the API; omitted means no static handler. */
  frontendDistDir?: string;
  /** JSON logger; defaults to a silent one so tests stay quiet and can inject a capturing one. */
  logger?: Logger;
  /** Auth attempt limits; defaults to the fixed production limits on the real clock (DEC-303). */
  authThrottle?: AuthThrottle;
  /** Password-hash concurrency gate; defaults to 2 at once with 8 queued (DEC-304). */
  hashGate?: HashGate;
}

/** Builds the Express app without opening a port or a DB connection, so tests can drive it with supertest. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  const clock = deps.clock ?? (() => new Date());
  const logger = deps.logger ?? createLogger('silent');
  app.disable('x-powered-by');
  if (deps.trustProxyHops) app.set('trust proxy', deps.trustProxyHops);
  // Request id first so every later line and response carries it; headers before any router or static file.
  app.use(createRequestId());
  app.use(createAccessLog(logger));
  app.use(createSecurityHeaders({ hsts: !!deps.secureCookies }));
  app.use(express.json());
  app.use(API_PREFIX, createHealthRouter(deps));
  app.use(
    API_PREFIX,
    createAuthRouter({
      clock,
      secureCookies: !!deps.secureCookies,
      hashGate: deps.hashGate ?? createHashGate(),
      throttle: deps.authThrottle ?? createAuthThrottle(),
    }),
  );
  app.use(API_PREFIX, createTasksRouter({ clock }));
  app.use(API_PREFIX, createTagsRouter({ clock }));
  if (deps.frontendDistDir) app.use(createStaticFrontend(deps.frontendDistDir, API_PREFIX));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
