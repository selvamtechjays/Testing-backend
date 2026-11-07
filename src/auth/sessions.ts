import { randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import { Session } from '../models/Session.js';

const SESSION_ID_BYTES = 32;
const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Inserts a session that expires one day after `now` and returns its id (the cookie value). */
export async function createSession(userId: Types.ObjectId, now: Date): Promise<string> {
  const id = randomBytes(SESSION_ID_BYTES).toString('hex');
  await Session.create({
    _id: id,
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
  });
  return id;
}
