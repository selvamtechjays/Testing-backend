import type { Express } from 'express';
import { createApp } from '../../src/app.js';

/** Builds the app for supertest with the DB reported as connected unless overridden. */
export function createTestApp(overrides: { isDbConnected?: () => boolean } = {}): Express {
  return createApp({ isDbConnected: overrides.isDbConnected ?? (() => true) });
}
