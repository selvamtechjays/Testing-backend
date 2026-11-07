// tier: contract
// requires: supertest against an in-process app (nothing to start)
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';
import { registerValidationSchema } from '../support/authSchemas.js';

// Contract for EP-AUTH-01 refusals that need no database. The 201 and 409 shapes are asserted
// against the same schemas in tests/integration/auth.register.test.ts, which has a real database.
describe('contract: POST /api/auth/register refusals', () => {
  it('matches the validation schema with only the failing fields', async () => {
    const res = await request(createTestApp())
      .post('/api/auth/register')
      .send({ username: 'ab', password: 'correct horse battery' })
      .expect(400);
    const body = expectMatchesSchema(registerValidationSchema, res.body);
    expect(Object.keys(body.error.fields)).toEqual(['username']);
  });

  it('matches the validation schema for an empty body', async () => {
    const res = await request(createTestApp()).post('/api/auth/register').expect(400);
    const body = expectMatchesSchema(registerValidationSchema, res.body);
    expect(Object.keys(body.error.fields).sort()).toEqual(['password', 'username']);
  });

  it('sets no cookie on a refusal', async () => {
    const res = await request(createTestApp()).post('/api/auth/register').send({}).expect(400);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});
