// tier: integration
// requires: mongodb-memory-server (in-process, started by tests/integration/globalSetup.ts)
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { hashSessionId } from '../../src/auth/sessions.js';
import { Session } from '../../src/models/Session.js';
import { User } from '../../src/models/User.js';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';
import {
  registerRequest,
  registerSuccessSchema,
  registerTakenSchema,
  registerValidationSchema,
} from '../support/authSchemas.js';
import { build } from '../support/builders.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function register(body: unknown, app = createTestApp()) {
  return request(app)
    .post('/api/auth/register')
    .send(body as object);
}

async function counts(): Promise<{ users: number; sessions: number }> {
  return { users: await User.countDocuments(), sessions: await Session.countDocuments() };
}

describe('POST /api/auth/register against a real database', () => {
  beforeAll(async () => {
    // The unique index must exist before the first insert, exactly as server.ts does at startup.
    await Promise.all([User.init(), Session.init()]);
  });

  it('creates the account, signs the user in and returns the contract shape (AC-1, BR-6)', async () => {
    const res = await register(registerRequest);
    expect(res.status).toBe(201);
    const body = expectMatchesSchema(registerSuccessSchema, res.body);
    expect(body.user.username).toBe('priya_b');
    expect(res.text).not.toContain('passwordHash');
    expect(res.text).not.toContain(registerRequest.password);
    const stored = await User.findOne({ username: 'priya_b' }).lean();
    expect(stored?._id.toString()).toBe(body.user.id);
    expect(stored?.passwordHash).not.toContain(registerRequest.password);
    expect(stored?.passwordHash.startsWith('scrypt$')).toBe(true);
  });

  it('sets a session cookie that is HttpOnly, SameSite=Lax, Path=/, with no Max-Age', async () => {
    const res = await register(registerRequest);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0] as string;
    expect(cookie).toMatch(/^sid=[0-9a-f]{64}; Path=\/; HttpOnly; SameSite=Lax$/);
  });

  it('adds Secure to the cookie in production mode', async () => {
    const res = await register(registerRequest, createTestApp({ secureCookies: true }));
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0] as string;
    expect(cookie).toContain('; Secure');
  });

  it('stores a session keyed by the SHA-256 of the cookie value that expires exactly one day later', async () => {
    const now = new Date('2026-03-01T10:00:00.000Z');
    const app = createTestApp({ clock: () => now });
    const res = await register(registerRequest, app);
    const sessionId = /sid=([0-9a-f]{64})/.exec(String(res.headers['set-cookie']))?.[1];
    expect(await Session.findById(sessionId).lean()).toBeNull();
    const session = await Session.findById(
      createHash('sha256')
        .update(sessionId ?? '')
        .digest('hex'),
    ).lean();
    expect(session?._id).toBe(hashSessionId(sessionId ?? ''));
    expect(session?._id).not.toBe(sessionId);
    expect(session?.userId.toString()).toBe(res.body.user.id);
    expect(session?.createdAt).toEqual(now);
    expect(session?.expiresAt.getTime()).toBe(now.getTime() + ONE_DAY_MS);
  });

  it('declares the unique username index and the TTL and user indexes', async () => {
    const userIndexes = await User.collection.indexes();
    expect(userIndexes.find((i) => i.key.username === 1)?.unique).toBe(true);
    const sessionIndexes = await Session.collection.indexes();
    expect(sessionIndexes.find((i) => i.key.expiresAt === 1)?.expireAfterSeconds).toBe(0);
    expect(sessionIndexes.some((i) => i.key.userId === 1)).toBe(true);
  });

  it('stores only username, password hash and createdAt when extra fields are sent (AC-2, BR-4)', async () => {
    const res = await register({
      ...registerRequest,
      email: 'a@b.c',
      role: 'admin',
      isAdmin: true,
      displayName: 'X',
    });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body.user).sort()).toEqual(['id', 'username']);
    const stored = await User.collection.findOne({ username: 'priya_b' });
    expect(Object.keys(stored ?? {}).sort()).toEqual(
      ['__v', '_id', 'createdAt', 'passwordHash', 'username'].sort(),
    );
  });

  it('creates no list, task or other collection (BR-5)', async () => {
    // Other test files share this database and leave collections of their own, so compare before and after.
    const listNames = async (): Promise<string[]> =>
      ((await mongoose.connection.db?.listCollections().toArray()) ?? []).map((c) => c.name);
    const countTasks = async (): Promise<number> =>
      (await mongoose.connection.db?.collection('tasks').countDocuments({})) ?? 0;
    const before = await listNames();
    const tasksBefore = await countTasks();
    await register(registerRequest);
    const after = await listNames();
    // Diff-aware: collections that exist before (e.g. `tasks`, created by the Task model on connect) are not
    // registration's doing. Only a collection that appears during registration, other than users and
    // sessions, fails this; so a register path that wrote a list or task collection would still be caught.
    expect(after.filter((n) => !before.includes(n) && !['users', 'sessions'].includes(n))).toEqual(
      [],
    );
    // The `tasks` collection may pre-exist (the Task model creates it on connect); registration must not seed it.
    expect(await countTasks()).toBe(tasksBefore);
  });

  it.each([3, 30])('accepts a %i-character username (AC-3)', async (length) => {
    const res = await register(build(registerRequest, { username: 'u'.repeat(length) }));
    expect(res.status).toBe(201);
  });

  it('accepts an 8-character lower-case password that is not common (AC-4)', async () => {
    const res = await register(build(registerRequest, { password: 'zebrafox' }));
    expect(res.status).toBe(201);
  });

  it('refuses a taken username with 409 and the field message (AC-10)', async () => {
    await register(registerRequest);
    const res = await register(registerRequest);
    expect(res.status).toBe(409);
    expectMatchesSchema(registerTakenSchema, res.body);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await counts()).toEqual({ users: 1, sessions: 1 });
  });

  it('refuses a username that differs only by capitals as taken (AC-11)', async () => {
    await register(registerRequest);
    const res = await register(build(registerRequest, { username: 'PRIYA_b' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USERNAME_TAKEN');
    expect(await User.countDocuments()).toBe(1);
  });

  it('creates exactly one account when two registrations race for one username (AC-12, NFR concurrency)', async () => {
    const app = createTestApp();
    const attempts = ['Race_User', 'race_user', 'RACE_USER', 'race_USER'].map((username) =>
      register(build(registerRequest, { username }), app),
    );
    const results = await Promise.all(attempts);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409]);
    expect(await counts()).toEqual({ users: 1, sessions: 1 });
    for (const r of results.filter((x) => x.status === 409)) {
      expectMatchesSchema(registerTakenSchema, r.body);
      expect(r.headers['set-cookie']).toBeUndefined();
    }
  });

  it.each([
    ['missing username', { password: 'correct horse battery' }],
    ['missing password', { username: 'priya_b' }],
    ['short username', { username: 'ab', password: 'correct horse battery' }],
    ['long username', { username: 'a'.repeat(31), password: 'correct horse battery' }],
    ['bad characters', { username: 'bad name', password: 'correct horse battery' }],
    ['short password', { username: 'priya_b', password: 'short' }],
    ['common password', { username: 'priya_b', password: 'Password123' }],
  ])(
    'a refused registration creates no user, no session and no cookie: %s (AC-5..9, AC-13)',
    async (_n, body) => {
      const res = await register(body);
      expect(res.status).toBe(400);
      expectMatchesSchema(registerValidationSchema, res.body);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(await counts()).toEqual({ users: 0, sessions: 0 });
    },
  );

  it('keeps the user but answers a generic 500 with no cookie when the session insert fails (DEC-073)', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(Session, 'create').mockRejectedValue(new Error('session store down'));
    const res = await register(registerRequest);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(logged.mock.calls)).not.toContain(registerRequest.password);
    expect(await counts()).toEqual({ users: 1, sessions: 0 });
  });

  it('answers a generic 500 and creates nothing when the user insert fails for a non-duplicate reason', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(User, 'create').mockRejectedValue(new Error('users store down'));
    const res = await register(registerRequest);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await counts()).toEqual({ users: 0, sessions: 0 });
  });

  it('uses the injected clock for the user createdAt (no wall-clock dependence)', async () => {
    const now = new Date('2030-01-02T03:04:05.000Z');
    await register(registerRequest, createTestApp({ clock: () => now }));
    const stored = await User.findOne({ username: 'priya_b' }).lean();
    expect(stored?.createdAt).toEqual(now);
  });
});
