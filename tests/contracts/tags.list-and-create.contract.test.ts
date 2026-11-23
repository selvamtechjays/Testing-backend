// tier: contract
// requires: nothing (the guard refuses before any database access; no DB, no network)
import request from 'supertest';
import { describe, it } from 'vitest';
import { unauthenticatedSchema } from '../support/authSchemas.js';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';

describe('contract: GET /api/tags (EP-TAG-01)', () => {
  it('refuses a caller with no session using the 401 envelope, whatever the query is', async () => {
    for (const query of ['', '?tag=none', '?x=1']) {
      const res = await request(createTestApp()).get(`/api/tags${query}`).expect(401);
      expectMatchesSchema(unauthenticatedSchema, res.body);
    }
  });
});

describe('contract: POST /api/tags (EP-TAG-02)', () => {
  it('refuses a caller with no session using the 401 envelope, before reading the body', async () => {
    for (const body of [{ name: 'Work' }, {}, { name: 'x', colour: 'pink' }]) {
      const res = await request(createTestApp()).post('/api/tags').send(body).expect(401);
      expectMatchesSchema(unauthenticatedSchema, res.body);
    }
  });
});
