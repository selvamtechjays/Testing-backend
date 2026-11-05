import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createHealthRouter, type HealthDeps } from './routes/health.js';

export const API_PREFIX = '/api';

/** Builds the Express app without opening a port or a DB connection, so tests can drive it with supertest. */
export function createApp(deps: HealthDeps): Express {
  const app = express();
  app.use(express.json());
  app.use(API_PREFIX, createHealthRouter(deps));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
