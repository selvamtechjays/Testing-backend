import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { createAuthThrottle, type AuthThrottle } from '../../src/auth/authThrottle.js';
import type { HashGate } from '../../src/auth/hashGate.js';
import type { Logger } from '../../src/lib/logger.js';

// Existing auth tests drive many attempts from one address; they get limits too high to trip. Tests of the
// limits themselves pass `authThrottle: createAuthThrottle()` for the real ones.
const RELAXED_LIMITS = {
  loginIpMax: 1_000_000,
  loginUserFailureMax: 1_000_000,
  registerIpMax: 1_000_000,
};

/** Builds the app for supertest with the DB reported as connected unless overridden. */
export function createTestApp(
  overrides: {
    isDbConnected?: () => boolean;
    clock?: () => Date;
    secureCookies?: boolean;
    logger?: Logger;
    authThrottle?: AuthThrottle;
    hashGate?: HashGate;
    trustProxyHops?: number;
  } = {},
): Express {
  return createApp({
    isDbConnected: overrides.isDbConnected ?? (() => true),
    clock: overrides.clock,
    secureCookies: overrides.secureCookies,
    logger: overrides.logger,
    hashGate: overrides.hashGate,
    trustProxyHops: overrides.trustProxyHops,
    authThrottle: overrides.authThrottle ?? createAuthThrottle({ limits: RELAXED_LIMITS }),
  });
}
