// tier: security
// requires: supertest against an in-process app (no database)
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../support/createTestApp.js';

const SECRET = 'S3cret-Passphrase-Value';

afterEach(() => {
  vi.restoreAllMocks();
});

function loggedText(...spies: ReturnType<typeof vi.spyOn>[]): string {
  return JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
}

describe('security: register never echoes or logs the password (NFR data classification)', () => {
  it('does not echo the password on a validation refusal', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await request(createTestApp())
      .post('/api/auth/register')
      .send({ username: 'a!', password: SECRET.slice(0, 5) });
    expect(res.status).toBe(400);
    expect(res.text).not.toContain(SECRET.slice(0, 5));
    expect(loggedText(err, warn)).not.toContain(SECRET.slice(0, 5));
  });

  it('does not echo or log the body of a malformed JSON request', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(createTestApp())
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send(`{"username":"x","password":"${SECRET}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.text).not.toContain(SECRET);
    expect(loggedText(err)).not.toContain(SECRET);
  });

  it('refuses markup in a username without reflecting it', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    const res = await request(createTestApp())
      .post('/api/auth/register')
      .send({ username: payload, password: 'correct horse battery' });
    expect(res.status).toBe(400);
    expect(res.text).not.toContain('onerror');
  });

  it('ignores unexpected fields such as email or role (AC-2, BR-4)', async () => {
    const res = await request(createTestApp())
      .post('/api/auth/register')
      .send({ username: 'ab', password: 'x', email: 'a@b.c', role: 'admin' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['password', 'username']);
  });
});
