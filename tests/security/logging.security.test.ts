// tier: security
// requires: supertest against an in-process app and an in-memory log destination (no database)
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/lib/logger.js';
import { createErrorApp } from '../support/errorApp.js';
import { createTestApp } from '../support/createTestApp.js';
import { createLogLines } from '../support/logLines.js';

const PASSWORD = 'Sup3r-Secret-Passphrase';
const SESSION_TOKEN = 'abcdef0123456789session-token';
const BEARER = 'bearer-token-value-777';

describe('security: logs never carry passwords, tokens or cookies (AC-6, DEC-309)', () => {
  it('writes none of them for requests that carry them in the body, cookie, authorization header and query', async () => {
    const lines = createLogLines();
    const app = createTestApp({ logger: createLogger('debug', lines.stream) });
    await request(app)
      .post('/api/auth/register')
      .set('Cookie', `sid=${SESSION_TOKEN}`)
      .set('Authorization', `Bearer ${BEARER}`)
      .send({ username: 'a!', password: PASSWORD })
      .expect(400);
    await request(app)
      .get(`/api/health?token=${SESSION_TOKEN}`)
      .set('Cookie', `sid=${SESSION_TOKEN}`)
      .set('Authorization', `Bearer ${BEARER}`)
      .expect(200);
    const raw = lines.raw();
    expect(lines.parsed().length).toBeGreaterThanOrEqual(2);
    for (const secret of [PASSWORD, SESSION_TOKEN, BEARER]) expect(raw).not.toContain(secret);
  });

  it('redacts the cookie and bearer token when a 500 handler logs an error that carries the request headers', async () => {
    const lines = createLogLines();
    const app = createErrorApp(
      (req) => {
        throw Object.assign(new Error('handler failed'), { headers: req.headers });
      },
      undefined,
      createLogger('debug', lines.stream),
    );
    await request(app)
      .post('/api/boom')
      .set('Cookie', `sid=${SESSION_TOKEN}`)
      .set('Authorization', `Bearer ${BEARER}`)
      .send({})
      .expect(500);
    const raw = lines.raw();
    expect(raw).toContain('handler failed');
    for (const secret of [SESSION_TOKEN, BEARER]) expect(raw).not.toContain(secret);
  });

  it('does not log the body of a malformed JSON request', async () => {
    const lines = createLogLines();
    const app = createTestApp({ logger: createLogger('debug', lines.stream) });
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(`{"username":"x","password":"${PASSWORD}`);
    expect(res.status).toBe(400);
    expect(lines.raw()).not.toContain(PASSWORD);
  });

  it('redacts a password or cookie placed on a logged object by any future call site', () => {
    const lines = createLogLines();
    createLogger('info', lines.stream).info(
      { password: PASSWORD, req: { headers: { cookie: `sid=${SESSION_TOKEN}` } } },
      'accidental',
    );
    expect(lines.raw()).not.toContain(PASSWORD);
    expect(lines.raw()).not.toContain(SESSION_TOKEN);
  });
});
