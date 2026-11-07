import { hashPassword } from '../auth/password.js';
import { createSession } from '../auth/sessions.js';
import { MESSAGES, type RegisterInput } from '../auth/validation.js';
import { ApiError } from '../lib/apiError.js';
import { User } from '../models/User.js';

export interface RegisteredUser {
  user: { id: string; username: string };
  sessionId: string;
}

const DUPLICATE_KEY_CODE = 11000;

function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === DUPLICATE_KEY_CODE;
}

/**
 * Creates the account, then its session. The unique index on `username` is the only duplicate guard
 * (no look-up first), so concurrent requests for one name create exactly one user. If the session
 * insert fails the user remains and the error propagates as a generic 500 (DEC-073).
 */
export async function registerUser(input: RegisterInput, now: Date): Promise<RegisteredUser> {
  const passwordHash = await hashPassword(input.password);
  let created;
  try {
    created = await User.create({ username: input.username, passwordHash, createdAt: now });
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw new ApiError(409, 'USERNAME_TAKEN', MESSAGES.usernameTaken, {
        username: MESSAGES.usernameTaken,
      });
    }
    throw err;
  }
  const sessionId = await createSession(created._id, now);
  return { user: { id: created._id.toString(), username: created.username }, sessionId };
}
