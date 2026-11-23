// tier: contract
// requires: supertest against an in-process app (nothing to start)
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/lib/logger.js';
import { createTestApp } from '../support/createTestApp.js';
import { createLogLines } from '../support/logLines.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('contract: X-Request-Id on every response (AC-5, DEC-308)', () => {
  it('creates an id when the request has none', async () => {
    const res = await request(createTestApp()).get('/api/health').expect(200);
    expect(res.headers['x-request-id']).toMatch(UUID);
  });

  it('echoes a well-formed incoming id', async () => {
    const res = await request(createTestApp())
      .get('/api/health')
      .set('X-Request-Id', 'support-ticket_42.a')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('support-ticket_42.a');
  });

  it('replaces a malformed incoming id with a generated one', async () => {
    const res = await request(createTestApp())
      .get('/api/health')
      .set('X-Request-Id', 'not valid!')
      .expect(200);
    expect(res.headers['x-request-id']).toMatch(UUID);
  });

  it('carries the id on the 404 and on a validation refusal, not only on success', async () => {
    const notFound = await request(createTestApp())
      .get('/api/nope')
      .set('X-Request-Id', 'nf-1')
      .expect(404);
    expect(notFound.headers['x-request-id']).toBe('nf-1');
    const refused = await request(createTestApp()).post('/api/auth/register').send({}).expect(400);
    expect(refused.headers['x-request-id']).toMatch(UUID);
  });

  it('names the same id in the access log line for that request (AC-6)', async () => {
    const lines = createLogLines();
    const app = createTestApp({ logger: createLogger('info', lines.stream) });
    await request(app).get('/api/health?probe=1').set('X-Request-Id', 'log-link-1').expect(200);
    const entry = lines.parsed().find((line) => line.msg === 'request completed');
    expect(entry).toMatchObject({
      requestId: 'log-link-1',
      method: 'GET',
      path: '/api/health',
      status: 200,
    });
    expect(typeof entry?.durationMs).toBe('number');
    expect(lines.raw()).not.toContain('probe=1');
  });
});
