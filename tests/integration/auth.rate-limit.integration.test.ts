// tier: integration
// requires: mongodb-memory-server (in-process, started by tests/integration/globalSetup.ts)
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createAuthThrottle } from '../../src/auth/authThrottle.js';
import { createHashGate, type HashGate } from '../../src/auth/hashGate.js';
import { hashPassword } from '../../src/auth/password.js';
import { Session } from '../../src/models/Session.js';
import { User } from '../../src/models/User.js';
import { createTestApp } from '../support/createTestApp.js';

const PASSWORD = 'correct horse battery';
const NOW = new Date('2026-03-01T10:00:00.000Z');
const RATE_LIMITED = {
  error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes.' },
};

let realHash: string;

/** The real gate, with a count of how many password hashes were asked for. */
function countingGate(inner: HashGate = createHashGate()): HashGate & { runs: number } {
  const gate = {
    runs: 0,
    run<T>(task: () => Promise<T>): Promise<T> {
      gate.runs += 1;
      return inner.run(task);
    },
  };
  return gate;
}

function login(app: ReturnType<typeof createTestApp>, username: string, password: string) {
  return request(app).post('/api/auth/login').send({ username, password });
}

function register(app: ReturnType<typeof createTestApp>, username: string) {
  return request(app).post('/api/auth/register').send({ username, password: PASSWORD });
}

describe('auth throttling and the hash gate against a real database', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init()]);
    // One real scrypt hash is reused for every seeded user to keep the suite fast.
    realHash = await hashPassword(PASSWORD);
  });

  it('refuses the 6th sign-in for a username after 5 failures, with Retry-After and no hashing (AC-1)', async () => {
    // A stored hash in no known format fails verification at once, so five failures cost no scrypt time.
    await User.create({ username: 'priya_b', passwordHash: 'not-a-real-hash', createdAt: NOW });
    const gate = countingGate();
    const app = createTestApp({ authThrottle: createAuthThrottle(), hashGate: gate });
    for (let i = 0; i < 5; i += 1) {
      expect((await login(app, 'priya_b', 'wrong-password-1')).status).toBe(401);
    }
    // From here the stored hash is a real one, so an unthrottled attempt would go through the gate and sign in.
    await User.updateOne({ username: 'priya_b' }, { passwordHash: realHash });
    gate.runs = 0;
    const res = await login(app, 'priya_b', PASSWORD);
    expect(res.status).toBe(429);
    expect(res.body).toEqual(RATE_LIMITED);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.headers['retry-after']).toMatch(/^\d+$/);
    expect(gate.runs).toBe(0);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await Session.countDocuments()).toBe(0);
    // The spy is bound: the same request against an unthrottled app does reach the gate and signs in.
    const unthrottled = createTestApp({ hashGate: gate });
    expect((await login(unthrottled, 'priya_b', PASSWORD)).status).toBe(200);
    expect(gate.runs).toBeGreaterThan(0);
  });

  it('gives the same 429 for a username that exists and one that does not (AC-1)', async () => {
    await User.create({ username: 'priya_b', passwordHash: 'not-a-real-hash', createdAt: NOW });
    const app = createTestApp({
      authThrottle: createAuthThrottle({ limits: { loginUserFailureMax: 1 } }),
    });
    await login(app, 'priya_b', 'wrong-password-1');
    await login(app, 'nobody_9', 'wrong-password-1');
    const known = await login(app, 'priya_b', PASSWORD);
    const unknown = await login(app, 'nobody_9', PASSWORD);
    expect(known.status).toBe(429);
    expect(unknown.status).toBe(429);
    expect(known.body).toEqual(unknown.body);
    expect(known.body).toEqual(RATE_LIMITED);
  });

  it('a correct sign-in clears the failures, so a normal user is not locked out (AC-1)', async () => {
    await User.create({ username: 'selvam', passwordHash: realHash, createdAt: NOW });
    const app = createTestApp({
      authThrottle: createAuthThrottle({ limits: { loginUserFailureMax: 2 } }),
    });
    expect((await login(app, 'selvam', 'wrong-password-1')).status).toBe(401);
    expect((await login(app, 'selvam', PASSWORD)).status).toBe(200);
    expect((await login(app, 'selvam', 'wrong-password-1')).status).toBe(401);
    // Without the clear this would be the second failure and the next request would be refused.
    expect((await login(app, 'selvam', 'wrong-password-2')).status).toBe(401);
  });

  it('refuses a throttled registration before any hashing and creates no user (AC-2)', async () => {
    const gate = countingGate();
    const app = createTestApp({
      authThrottle: createAuthThrottle({ limits: { registerIpMax: 2 } }),
      hashGate: gate,
    });
    expect((await register(app, 'user_one')).status).toBe(201);
    expect((await register(app, 'user_two')).status).toBe(201);
    gate.runs = 0;
    const res = await register(app, 'user_three');
    expect(res.status).toBe(429);
    expect(res.body).toEqual(RATE_LIMITED);
    expect(res.headers['retry-after']).toMatch(/^\d+$/);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(gate.runs).toBe(0);
    expect(await User.countDocuments()).toBe(2);
    expect(await Session.countDocuments()).toBe(2);
  });

  it('answers 503 with Retry-After 5 and creates nothing when the hash queue is full (AC-3)', async () => {
    // The first permit is held by a promise the test controls, so the queue is full no matter how fast scrypt is.
    const inner = createHashGate({ maxConcurrent: 1, maxQueued: 0 });
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = inner.run(() => held);
    const app = createTestApp({ hashGate: inner });
    const refused = await register(app, 'racer_two');
    expect(refused.status).toBe(503);
    expect(refused.headers['retry-after']).toBe('5');
    expect(refused.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(refused.headers['set-cookie']).toBeUndefined();
    expect(await User.countDocuments()).toBe(0);
    release();
    await holder;
    expect((await register(app, 'racer_one')).status).toBe(201);
    expect(await User.countDocuments()).toBe(1);
  });

  it('sends the unknown-username dummy comparison through the same gate (AC-3)', async () => {
    const gate = countingGate();
    const app = createTestApp({ hashGate: gate });
    const res = await login(app, 'nobody_9', PASSWORD);
    expect(res.status).toBe(401);
    expect(gate.runs).toBe(1);
  });
});
