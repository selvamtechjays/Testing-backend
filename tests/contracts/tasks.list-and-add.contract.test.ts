// tier: contract
// requires: nothing (the guard refuses before any database access; no DB, no network)
import request from 'supertest';
import { describe, it } from 'vitest';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';
import { unauthenticatedSchema } from '../support/authSchemas.js';

describe('contract: GET /api/tasks (EP-TASK-01)', () => {
  it('refuses a caller with no session using the 401 envelope', async () => {
    const res = await request(createTestApp()).get('/api/tasks').expect(401);
    expectMatchesSchema(unauthenticatedSchema, res.body);
  });
});

describe('contract: POST /api/tasks (EP-TASK-02)', () => {
  it('refuses a caller with no session using the 401 envelope', async () => {
    const res = await request(createTestApp())
      .post('/api/tasks')
      .send({ title: 'No session' })
      .expect(401);
    expectMatchesSchema(unauthenticatedSchema, res.body);
  });
});
