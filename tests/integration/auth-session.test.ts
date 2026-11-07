// tier: integration
// requires: mongodb-memory-server (in-process, started by tests/integration/globalSetup.ts)
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../../src/auth/password.js';
import { hashSessionId } from '../../src/auth/sessions.js';
import { Session } from '../../src/models/Session.js';
import { User } from '../../src/models/User.js';
import {
  loginSuccessSchema,
  unauthenticatedSchema,
  invalidCredentialsSchema,
  loginValidationSchema,
} from '../support/authSchemas.js';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const PASSWORD = 'correct horse battery';
const T0 = new Date('2026-03-01T10:00:00.000Z');

let passwordHash: string;

async function seedUser(username = 'selvam') {
  return User.create({ username, passwordHash, createdAt: T0 });
}

function login(body: unknown, app = createTestApp(), cookie?: string) {
  const req = request(app).post('/api/auth/login');
  if (cookie) req.set('Cookie', cookie);
  return req.send(body as object);
}

function sessionCookie(res: request.Response): string {
  const raw = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0] ?? '';
  return /^sid=([0-9a-f]{64})/.exec(raw)?.[1] ?? '';
}

describe('sign in, session guard and sign out against a real database', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init()]);
    // One scrypt hash for every seeded user keeps the suite fast; hashing is covered by auth.password tests.
    passwordHash = await hashPassword(PASSWORD);
  });

  it('signs in, sets the cookie and opens /me as the same user (AC-1)', async () => {
    const user = await seedUser();
    const res = await login({ username: 'selvam', password: PASSWORD });
    expect(res.status).toBe(200);
    const body = expectMatchesSchema(loginSuccessSchema, res.body);
    expect(body.user).toEqual({ id: user._id.toString(), username: 'selvam' });
    const sid = sessionCookie(res);
    expect(sid).not.toBe('');
    const me = await request(createTestApp()).get('/api/auth/me').set('Cookie', `sid=${sid}`);
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ user: { id: user._id.toString(), username: 'selvam' } });
    expect(res.text).not.toContain(PASSWORD);
    expect(res.text).not.toContain('passwordHash');
  });

  it('matches the username without regard to capitals (AC-2, BR-1)', async () => {
    await seedUser();
    for (const typed of ['SELVAM', 'Selvam', 'selvam']) {
      const res = await login({ username: typed, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('selvam');
    }
  });

  it('sets a cookie with HttpOnly, SameSite=Lax, Path=/, no Max-Age and no Expires (AC-3, AC-11)', async () => {
    await seedUser();
    const res = await login({ username: 'selvam', password: PASSWORD });
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0] as string;
    expect(cookie).toMatch(/^sid=[0-9a-f]{64}; Path=\/; HttpOnly; SameSite=Lax$/);
    expect(cookie).not.toMatch(/Max-Age|Expires/i);
  });

  it('adds Secure only when secure cookies are on (R-4)', async () => {
    await seedUser();
    const res = await login(
      { username: 'selvam', password: PASSWORD },
      createTestApp({ secureCookies: true }),
    );
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toContain('; Secure');
  });

  it('stores the session by the hash of the cookie, expiring exactly one day after the injected clock (AC-4)', async () => {
    const user = await seedUser();
    const res = await login(
      { username: 'selvam', password: PASSWORD },
      createTestApp({ clock: () => T0 }),
    );
    const sid = sessionCookie(res);
    expect(await Session.findById(sid).lean()).toBeNull();
    const stored = await Session.findById(hashSessionId(sid)).lean();
    expect(stored?.userId.toString()).toBe(user._id.toString());
    expect(stored?.createdAt).toEqual(T0);
    expect(stored?.expiresAt.getTime()).toBe(T0.getTime() + ONE_DAY_MS);
  });

  it('refuses a wrong password and an unknown username with byte-identical bodies and no session (AC-6, AC-7, BR-2)', async () => {
    await seedUser();
    const wrong = await login({ username: 'selvam', password: 'not the password' });
    const unknown = await login({ username: 'nobody_here', password: 'not the password' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expectMatchesSchema(invalidCredentialsSchema, wrong.body);
    expect(wrong.text).toBe(unknown.text);
    expect(wrong.headers['set-cookie']).toBeUndefined();
    expect(unknown.headers['set-cookie']).toBeUndefined();
    expect(await Session.countDocuments()).toBe(0);
  });

  it('treats a username of HTML tags as an ordinary unknown user (AC-7)', async () => {
    const res = await login({ username: '<script>alert(1)</script>', password: 'x' });
    expect(res.status).toBe(401);
    expectMatchesSchema(invalidCredentialsSchema, res.body);
    expect(res.text).not.toContain('script');
  });

  it('spends comparable time on an unknown username and a wrong password (R-1)', async () => {
    await seedUser();
    const time = async (username: string) => {
      const start = performance.now();
      await login({ username, password: 'not the password' });
      return performance.now() - start;
    };
    const wrong = await time('selvam');
    const unknown = await time('nobody_here');
    // Without the dummy comparison the unknown path would return in a few ms.
    expect(unknown).toBeGreaterThan(wrong * 0.3);
  });

  it('never locks out: ten wrong passwords, then the correct one signs in (AC-8)', async () => {
    await seedUser();
    const app = createTestApp();
    for (let i = 0; i < 10; i += 1) {
      const res = await login({ username: 'selvam', password: `wrong-${i}` }, app);
      expect(res.status).toBe(401);
    }
    const ok = await login({ username: 'selvam', password: PASSWORD }, app);
    expect(ok.status).toBe(200);
  }, 60_000);

  it('creates a fresh session every login, ignores a presented id, and leaves older sessions valid (R-3)', async () => {
    await seedUser();
    const first = sessionCookie(await login({ username: 'selvam', password: PASSWORD }));
    const fixated = 'f'.repeat(64);
    const second = sessionCookie(
      await login({ username: 'selvam', password: PASSWORD }, createTestApp(), `sid=${fixated}`),
    );
    expect(second).not.toBe(first);
    expect(second).not.toBe(fixated);
    expect(await Session.findById(hashSessionId(fixated)).lean()).toBeNull();
    expect(await Session.countDocuments()).toBe(2);
    const me = await request(createTestApp()).get('/api/auth/me').set('Cookie', `sid=${first}`);
    expect(me.status).toBe(200);
  });

  it.each([
    ['missing both', {}],
    ['empty username', { username: '', password: PASSWORD }],
    ['empty password', { username: 'selvam', password: '' }],
    ['non-string password', { username: 'selvam', password: 12345678 }],
  ])('refuses %s with 400 VALIDATION and no session', async (_n, body) => {
    const res = await login(body);
    expect(res.status).toBe(400);
    expectMatchesSchema(loginValidationSchema, res.body);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await Session.countDocuments()).toBe(0);
  });

  it('does not trim the username: a padded name is unknown', async () => {
    await seedUser();
    const res = await login({ username: ' selvam ', password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('refuses a session older than one day and deletes its row (AC-4, BR-3)', async () => {
    await seedUser();
    const res = await login(
      { username: 'selvam', password: PASSWORD },
      createTestApp({ clock: () => T0 }),
    );
    const sid = sessionCookie(res);
    const dayLater = createTestApp({ clock: () => new Date(T0.getTime() + ONE_DAY_MS) });
    const me = await request(dayLater).get('/api/auth/me').set('Cookie', `sid=${sid}`);
    expect(me.status).toBe(401);
    expectMatchesSchema(unauthenticatedSchema, me.body);
    expect(await Session.countDocuments()).toBe(0);
  });

  it('does not extend the session: use just before expiry leaves expiresAt unchanged (AC-11)', async () => {
    await seedUser();
    const sid = sessionCookie(
      await login({ username: 'selvam', password: PASSWORD }, createTestApp({ clock: () => T0 })),
    );
    const late = createTestApp({ clock: () => new Date(T0.getTime() + ONE_DAY_MS - 1000) });
    expect((await request(late).get('/api/auth/me').set('Cookie', `sid=${sid}`)).status).toBe(200);
    const stored = await Session.findById(hashSessionId(sid)).lean();
    expect(stored?.expiresAt.getTime()).toBe(T0.getTime() + ONE_DAY_MS);
    const after = createTestApp({ clock: () => new Date(T0.getTime() + ONE_DAY_MS + 1000) });
    expect((await request(after).get('/api/auth/me').set('Cookie', `sid=${sid}`)).status).toBe(401);
  });

  it('refuses /me with no cookie, an unknown session, or a raw stored hash as the cookie (AC-9)', async () => {
    await seedUser();
    const sid = sessionCookie(await login({ username: 'selvam', password: PASSWORD }));
    const app = createTestApp();
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/auth/me')
          .set('Cookie', `sid=${'0'.repeat(64)}`)
      ).status,
    ).toBe(401);
    // The database holds only the hash; presenting it as the cookie must not work.
    const replay = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `sid=${hashSessionId(sid)}`);
    expect(replay.status).toBe(401);
  });

  it('refuses /me when the session belongs to a user that was removed', async () => {
    const user = await seedUser();
    const sid = sessionCookie(await login({ username: 'selvam', password: PASSWORD }));
    await User.deleteOne({ _id: user._id });
    const me = await request(createTestApp()).get('/api/auth/me').set('Cookie', `sid=${sid}`);
    expect(me.status).toBe(401);
    expectMatchesSchema(unauthenticatedSchema, me.body);
  });

  it('logout deletes only the presented session, clears the cookie, and /me then refuses (AC-5, AC-9, BR-4)', async () => {
    await seedUser();
    const app = createTestApp();
    const a = sessionCookie(await login({ username: 'selvam', password: PASSWORD }, app));
    const b = sessionCookie(await login({ username: 'selvam', password: PASSWORD }, app));
    const out = await request(app).post('/api/auth/logout').set('Cookie', `sid=${a}`);
    expect(out.status).toBe(204);
    expect(out.text).toBe('');
    const cleared = (out.headers['set-cookie'] as unknown as string[])[0] as string;
    expect(cleared).toMatch(/^sid=;/);
    expect(cleared).toMatch(/Max-Age=0/);
    expect((await request(app).get('/api/auth/me').set('Cookie', `sid=${a}`)).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', `sid=${b}`)).status).toBe(200);
    expect(await Session.countDocuments()).toBe(1);
  });

  it('logout is idempotent and quiet for no cookie, an unknown session, and an expired one (AC-10)', async () => {
    await seedUser();
    const sid = sessionCookie(
      await login({ username: 'selvam', password: PASSWORD }, createTestApp({ clock: () => T0 })),
    );
    const app = createTestApp({ clock: () => new Date(T0.getTime() + 2 * ONE_DAY_MS) });
    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
    expect(
      (
        await request(app)
          .post('/api/auth/logout')
          .set('Cookie', `sid=${'1'.repeat(64)}`)
      ).status,
    ).toBe(204);
    expect((await request(app).post('/api/auth/logout').set('Cookie', `sid=${sid}`)).status).toBe(
      204,
    );
    expect((await request(app).post('/api/auth/logout').set('Cookie', `sid=${sid}`)).status).toBe(
      204,
    );
  });
});
