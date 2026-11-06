import request from 'supertest';
import { describe, it } from 'vitest';
import { z } from 'zod';
import { createTestApp } from '../support/createTestApp.js';
import { expectMatchesSchema } from '../support/contract.js';

// Contract tests: one zod schema per endpoint response. Map to TL EP-<AREA>-NN ids once endpoints are in the graph.
const healthResponse = z.strictObject({
  status: z.literal('ok'),
  db: z.enum(['connected', 'disconnected']),
});
const errorResponse = z.strictObject({
  error: z.strictObject({ code: z.literal('NOT_FOUND'), message: z.string() }),
});

describe('contract: GET /api/health', () => {
  it('matches the health schema when connected', async () => {
    const res = await request(createTestApp()).get('/api/health').expect(200);
    expectMatchesSchema(healthResponse, res.body);
  });

  it('matches the health schema when disconnected', async () => {
    const res = await request(createTestApp({ isDbConnected: () => false }))
      .get('/api/health')
      .expect(200);
    expectMatchesSchema(healthResponse, res.body);
  });
});

describe('contract: unknown route', () => {
  it('returns the error schema with 404', async () => {
    const res = await request(createTestApp()).get('/api/nope').expect(404);
    expectMatchesSchema(errorResponse, res.body);
  });
});
