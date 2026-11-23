import { Router } from 'express';
import type { AuthThrottle } from '../auth/authThrottle.js';
import { buildClearedSessionCookie, buildSessionCookie, readSessionId } from '../auth/cookie.js';
import type { HashGate } from '../auth/hashGate.js';
import { createRequireSession } from '../auth/requireSession.js';
import { loginSchema, registerSchema } from '../auth/validation.js';
import { ApiError } from '../lib/apiError.js';
import { asRecord } from '../lib/asRecord.js';
import { parseBody } from '../lib/parseBody.js';
import { endSession, loginUser, registerUser } from '../services/auth.js';

export interface AuthDeps {
  clock: () => Date;
  secureCookies: boolean;
  hashGate: HashGate;
  throttle: AuthThrottle;
}

function isInvalidCredentials(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'INVALID_CREDENTIALS';
}

/** Public account routes. Register creates the user and its session, then sets the session cookie. */
export function createAuthRouter(deps: AuthDeps): Router {
  const router = Router();
  router.post('/auth/register', async (req, res) => {
    // Counted before the body is read or anything is hashed, so a flood costs almost nothing.
    deps.throttle.checkRegisterAddress(req.ip);
    const input = parseBody(registerSchema, asRecord(req.body));
    const { user, sessionId } = await registerUser(input, deps.clock(), deps.hashGate);
    res.setHeader('Set-Cookie', buildSessionCookie(sessionId, { secure: deps.secureCookies }));
    res.status(201).json({ user });
  });
  router.post('/auth/login', async (req, res) => {
    deps.throttle.checkLoginAddress(req.ip);
    const input = parseBody(loginSchema, asRecord(req.body));
    // Reserves an in-flight slot, so concurrent attempts count toward the limit before any fails.
    deps.throttle.checkLoginUsername(input.username);
    let signedIn;
    try {
      signedIn = await loginUser(input, deps.clock(), deps.hashGate);
    } catch (err) {
      if (isInvalidCredentials(err)) deps.throttle.recordLoginFailure(input.username);
      throw err;
    } finally {
      deps.throttle.releaseLogin(input.username);
    }
    deps.throttle.clearLogin(input.username);
    const { user, sessionId } = signedIn;
    res.setHeader('Set-Cookie', buildSessionCookie(sessionId, { secure: deps.secureCookies }));
    res.status(200).json({ user });
  });
  router.post('/auth/logout', async (req, res) => {
    await endSession(readSessionId(req.headers.cookie));
    res.setHeader('Set-Cookie', buildClearedSessionCookie({ secure: deps.secureCookies }));
    res.status(204).end();
  });
  router.get('/auth/me', createRequireSession({ clock: deps.clock }), (_req, res) => {
    res.status(200).json({ user: res.locals.user });
  });
  return router;
}
