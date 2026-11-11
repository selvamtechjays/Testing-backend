import { createSession } from '../../src/auth/sessions.js';
import { User } from '../../src/models/User.js';

export const SIGN_IN_TIME = new Date('2026-03-01T10:00:00.000Z');

export interface TestUser {
  id: string;
  cookie: string;
}

/**
 * Inserts a user and a live session directly (no password round-trip), for tests that need a signed-in
 * caller. Pair it with a test app whose clock is within a day of SIGN_IN_TIME.
 */
export async function signInAs(username: string): Promise<TestUser> {
  const user = await User.create({
    username,
    passwordHash: 'not-a-real-hash',
    createdAt: SIGN_IN_TIME,
  });
  const cookieValue = await createSession(user._id, SIGN_IN_TIME);
  return { id: user._id.toString(), cookie: `sid=${cookieValue}` };
}
