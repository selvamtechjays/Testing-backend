// tier: contract
// requires: nothing (the guard refuses before any database access; no DB, no network)
import request from 'supertest';
import { describe, it } from 'vitest';
import { unauthenticatedSchema } from '../support/authSchemas.js';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';

const GOOD_ID = '0123456789abcdef01234567';

describe('contract: PATCH /api/tags/:id (EP-TAG-03)', () => {
  it('refuses a caller with no session using the 401 envelope, whatever the id and body are', async () => {
    const cases: [string, object][] = [
      [GOOD_ID, { name: 'Office' }],
      [GOOD_ID, {}],
      ['not-an-id', { name: '', colour: 'pink' }],
    ];
    for (const [id, body] of cases) {
      const res = await request(createTestApp()).patch(`/api/tags/${id}`).send(body).expect(401);
      expectMatchesSchema(unauthenticatedSchema, res.body);
    }
  });
});

describe('contract: DELETE /api/tags/:id (EP-TAG-04)', () => {
  it('refuses a caller with no session using the 401 envelope, whatever the id is', async () => {
    for (const id of [GOOD_ID, 'not-an-id']) {
      const res = await request(createTestApp()).delete(`/api/tags/${id}`).expect(401);
      expectMatchesSchema(unauthenticatedSchema, res.body);
    }
  });
});
