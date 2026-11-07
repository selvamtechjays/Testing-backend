import { createHash, randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import { Session } from '../models/Session.js';

const SESSION_ID_BYTES = 32;
const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** The stored session key for a cookie value: SHA-256 hex. Every lookup must hash the incoming cookie first. */
export function hashSessionId(cookieValue: string): string {
  return createHash('sha256').update(cookieValue).digest('hex');
}

/** Inserts a session that expires one day after `now` and returns the cookie value; only its hash is stored. */
export async function createSession(userId: Types.ObjectId, now: Date): Promise<string> {
  const id = randomBytes(SESSION_ID_BYTES).toString('hex');
  await Session.create({
    _id: hashSessionId(id),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
  });
  return id;
}
