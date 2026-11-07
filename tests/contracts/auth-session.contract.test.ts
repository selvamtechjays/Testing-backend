// tier: contract
// requires: supertest against an in-process app (nothing to start)
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loginValidationSchema, unauthenticatedSchema } from '../support/authSchemas.js';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';

// Contract for the EP-AUTH-02/03/04 responses that need no database. The 200 shapes and the 401
// INVALID_CREDENTIALS shape are asserted against the same schemas in tests/integration/auth-session.test.ts.
describe('contract: POST /api/auth/login refusals', () => {
  it('matches the validation schema for an empty body (EP-AUTH-02)', async () => {
    const res = await request(createTestApp()).post('/api/auth/login').expect(400);
    const body = expectMatchesSchema(loginValidationSchema, res.body);
    expect(Object.keys(body.error.fields).sort()).toEqual(['password', 'username']);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('names only the failing field', async () => {
    const res = await request(createTestApp())
      .post('/api/auth/login')
      .send({ username: 'selvam', password: '' })
      .expect(400);
    const body = expectMatchesSchema(loginValidationSchema, res.body);
    expect(Object.keys(body.error.fields)).toEqual(['password']);
  });
});

describe('contract: GET /api/auth/me refusal', () => {
  it('matches the UNAUTHENTICATED schema without a cookie (EP-AUTH-04)', async () => {
    const res = await request(createTestApp()).get('/api/auth/me').expect(401);
    expectMatchesSchema(unauthenticatedSchema, res.body);
  });
});

describe('contract: POST /api/auth/logout', () => {
  it('answers 204 with an empty body and a cookie-clearing header when no cookie is sent (EP-AUTH-03)', async () => {
    const res = await request(createTestApp()).post('/api/auth/logout').expect(204);
    expect(res.text).toBe('');
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0] as string;
    expect(cookie).toMatch(/^sid=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=/);
  });

  it('adds Secure to the clearing cookie in production mode', async () => {
    const res = await request(createTestApp({ secureCookies: true }))
      .post('/api/auth/logout')
      .expect(204);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toContain('; Secure');
  });
});
