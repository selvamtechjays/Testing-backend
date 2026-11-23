// tier: contract
// requires: supertest against an in-process app and a temp directory standing in for the built frontend (nothing to start)
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createAuthThrottle } from '../../src/auth/authThrottle.js';
import { createTestApp } from '../support/createTestApp.js';

let distDir: string;

beforeAll(() => {
  distDir = mkdtempSync(path.join(tmpdir(), 'tasknest-headers-'));
  writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>TaskNest</title>');
});

afterAll(() => {
  rmSync(distDir, { recursive: true, force: true });
});

function expectStandardHeaders(headers: Record<string, string | string[] | undefined>) {
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('SAMEORIGIN');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['x-powered-by']).toBeUndefined();
  expect(headers['access-control-allow-origin']).toBeUndefined();
}

describe('contract: security headers on every response (AC-4, DEC-310)', () => {
  it('sends the standard header set on a successful API response', async () => {
    const res = await request(createTestApp()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
    expectStandardHeaders(res.headers);
  });

  it('sends them on the JSON 404 and on a validation refusal', async () => {
    const notFound = await request(createTestApp()).get('/api/nope').expect(404);
    expectStandardHeaders(notFound.headers);
    const refused = await request(createTestApp()).post('/api/auth/login').send({}).expect(400);
    expectStandardHeaders(refused.headers);
  });

  it('sends them on a 429 rate-limit refusal', async () => {
    const app = createTestApp({ authThrottle: createAuthThrottle({ now: () => 1_000_000 }) });
    for (let i = 0; i < 10; i += 1) await request(app).post('/api/auth/login').send({}).expect(400);
    const limited = await request(app).post('/api/auth/login').send({}).expect(429);
    expectStandardHeaders(limited.headers);
  });

  it('sends them on the built frontend files as well', async () => {
    const app = createApp({ isDbConnected: () => true, frontendDistDir: distDir });
    const page = await request(app).get('/').expect(200);
    expectStandardHeaders(page.headers);
  });

  it('adds Strict-Transport-Security only when secure cookies are on', async () => {
    const plain = await request(createTestApp()).get('/api/health');
    expect(plain.headers['strict-transport-security']).toBeUndefined();
    const secure = await request(createTestApp({ secureCookies: true })).get('/api/health');
    expect(secure.headers['strict-transport-security']).toMatch(/max-age=\d+/);
  });

  it('adds no CORS headers even when a cross-origin request arrives', async () => {
    const res = await request(createTestApp())
      .get('/api/health')
      .set('Origin', 'https://elsewhere.example');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('still serves the API same-origin: JSON bodies and cookies pass through untouched', async () => {
    const res = await request(createTestApp({ secureCookies: true }))
      .post('/api/auth/logout')
      .expect(204);
    expect(res.headers['set-cookie']?.[0]).toMatch(/^sid=;/);
  });
});
