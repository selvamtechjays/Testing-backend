import express, { type Express, type RequestHandler } from 'express';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler.js';

/** Minimal app with real json parsing and real error middleware, plus one route that runs `handler`. */
export function createErrorApp(handler: RequestHandler, limit?: string): Express {
  const app = express();
  app.use(express.json(limit ? { limit } : {}));
  app.post('/api/boom', handler);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
