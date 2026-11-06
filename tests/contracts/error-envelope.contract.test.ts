// tier: contract
// requires: supertest against an in-process app (nothing to start)
import request from 'supertest';
import { describe, it } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../../src/lib/apiError.js';
import { createErrorApp } from '../support/errorApp.js';
import { expectMatchesSchema } from '../support/contract.js';

// Contract for the cross-cutting error envelope owned by FEAT-PLAT-01 (DEC-060, DEC-072).
const CODES = [
  'VALIDATION',
  'BAD_REQUEST',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'NOT_FOUND',
  'USERNAME_TAKEN',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
] as const;

const envelope = z.strictObject({
  error: z.strictObject({
    code: z.enum(CODES),
    message: z.string().min(1),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});

describe('contract: error envelope', () => {
  it('ApiError with fields matches the envelope schema (AC-3, AC-5)', async () => {
    const app = createErrorApp(() => {
      throw new ApiError(400, 'VALIDATION', 'Validation failed', { title: 'Enter a title.' });
    });
    const res = await request(app).post('/api/boom').expect(400);
    expectMatchesSchema(envelope, res.body);
  });

  it('malformed JSON matches the envelope schema (AC-8)', async () => {
    const res = await request(createErrorApp(() => undefined))
      .post('/api/boom')
      .set('Content-Type', 'application/json')
      .send('{bad')
      .expect(400);
    expectMatchesSchema(envelope, res.body);
  });

  it('unmatched route matches the envelope schema (BR-3)', async () => {
    const res = await request(createErrorApp(() => undefined))
      .get('/api/missing')
      .expect(404);
    expectMatchesSchema(envelope, res.body);
  });

  it('401 from a session guard matches the envelope schema (AC-4, AC-6)', async () => {
    const app = createErrorApp(() => {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required');
    });
    const res = await request(app).post('/api/boom').expect(401);
    expectMatchesSchema(envelope, res.body);
  });
});
