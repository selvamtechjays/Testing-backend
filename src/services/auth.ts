import { hashPassword, verifyPassword } from '../auth/password.js';
import { createSession, hashSessionId } from '../auth/sessions.js';
import { MESSAGES, type LoginInput, type RegisterInput } from '../auth/validation.js';
import { ApiError } from '../lib/apiError.js';
import { Session } from '../models/Session.js';
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

// A well-formed scrypt hash at the production cost, matching no password. Verifying against it for an
// unknown username spends the same time as a real check, so response time does not reveal the account (DEC-072).
const DUMMY_PASSWORD_HASH = `scrypt$32768$8$3$${'00'.repeat(16)}$${'ab'.repeat(64)}`;

/**
 * Signs a user in. Unknown username and wrong password are indistinguishable: same error, and a scrypt
 * comparison always runs. Every success creates a fresh session; existing sessions stay valid.
 */
export async function loginUser(input: LoginInput, now: Date): Promise<RegisteredUser> {
  const user = await User.findOne({ username: input.username }).lean();
  const matches = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !matches) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', MESSAGES.invalidCredentials);
  }
  const sessionId = await createSession(user._id, now);
  return { user: { id: user._id.toString(), username: user.username }, sessionId };
}

/** Deletes only the presented session. A missing or unknown id is not an error (idempotent). */
export async function endSession(cookieValue: string | undefined): Promise<void> {
  if (!cookieValue) return;
  await Session.deleteOne({ _id: hashSessionId(cookieValue) });
}
