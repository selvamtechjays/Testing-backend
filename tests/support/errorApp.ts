import express, { type Express, type RequestHandler } from 'express';
import { createLogger, type Logger } from '../../src/lib/logger.js';
import { createErrorHandler, notFoundHandler } from '../../src/middleware/errorHandler.js';
import { createRequestId } from '../../src/middleware/requestId.js';

/**
 * Minimal app with real json parsing, the real request id and error middleware, plus one route that runs
 * `handler`. Pass a logger to capture what the error handler writes.
 */
export function createErrorApp(
  handler: RequestHandler,
  limit?: string,
  logger: Logger = createLogger('silent'),
): Express {
  const app = express();
  app.use(createRequestId());
  app.use(express.json(limit ? { limit } : {}));
  app.post('/api/boom', handler);
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
