import { Router } from 'express';
import { buildSessionCookie } from '../auth/cookie.js';
import { registerSchema } from '../auth/validation.js';
import { parseBody } from '../lib/parseBody.js';
import { registerUser } from '../services/auth.js';

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
  return router;
}
