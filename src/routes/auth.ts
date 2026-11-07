import { Router } from 'express';
import { buildClearedSessionCookie, buildSessionCookie, readSessionId } from '../auth/cookie.js';
import { createRequireSession } from '../auth/requireSession.js';
import { loginSchema, registerSchema } from '../auth/validation.js';
import { parseBody } from '../lib/parseBody.js';
import { endSession, loginUser, registerUser } from '../services/auth.js';

export interface AuthDeps {
  clock: () => Date;
  secureCookies: boolean;
}

function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

/** Public account routes. Register creates the user and its session, then sets the session cookie. */
export function createAuthRouter(deps: AuthDeps): Router {
  const router = Router();
  router.post('/auth/register', async (req, res) => {
    const input = parseBody(registerSchema, asRecord(req.body));
    const { user, sessionId } = await registerUser(input, deps.clock());
    res.setHeader('Set-Cookie', buildSessionCookie(sessionId, { secure: deps.secureCookies }));
    res.status(201).json({ user });
  });
  router.post('/auth/login', async (req, res) => {
    const input = parseBody(loginSchema, asRecord(req.body));
    const { user, sessionId } = await loginUser(input, deps.clock());
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
