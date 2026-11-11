// tier: contract
// requires: nothing (the guard refuses before any database access; no DB, no network)
import request from 'supertest';
import { describe, it } from 'vitest';
import { unauthenticatedSchema } from '../support/authSchemas.js';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';

describe('contract: DELETE /api/tasks/:id (EP-TASK-04)', () => {
  it('refuses a caller with no session using the 401 envelope', async () => {
    const res = await request(createTestApp())
      .delete('/api/tasks/0123456789abcdef01234567')
      .expect(401);
    expectMatchesSchema(unauthenticatedSchema, res.body);
  });
});
