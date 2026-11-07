import type { RequestHandler } from 'express';
import { ApiError } from '../lib/apiError.js';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { readSessionId } from './cookie.js';
import { hashSessionId } from './sessions.js';
import { MESSAGES } from './validation.js';

export interface SessionUser {
  id: string;
  username: string;
}

/** Locals the guard sets on a signed-in request: `res.locals.user`. */
declare module 'express-serve-static-core' {
  interface Locals {
    user?: SessionUser;
  }
}

/**
 * Access boundary for protected routes. Looks the session up by the hash of the cookie value, treats
 * `expiresAt <= clock now` as ended (and deletes the row, since the TTL purge is not instant), and
 * never extends `expiresAt`. Every refusal is the same 401 UNAUTHENTICATED.
 */
export function createRequireSession(deps: { clock: () => Date }): RequestHandler {
  const refuse = () => new ApiError(401, 'UNAUTHENTICATED', MESSAGES.notSignedIn);
  return async (req, res, next) => {
    const cookieValue = readSessionId(req.headers.cookie);
    if (!cookieValue) throw refuse();
    const session = await Session.findById(hashSessionId(cookieValue)).lean();
    if (!session) throw refuse();
    if (session.expiresAt.getTime() <= deps.clock().getTime()) {
      await Session.deleteOne({ _id: session._id });
      throw refuse();
    }
    const user = await User.findById(session.userId).lean();
    if (!user) throw refuse();
    res.locals.user = { id: user._id.toString(), username: user.username };
    next();
  };
}
