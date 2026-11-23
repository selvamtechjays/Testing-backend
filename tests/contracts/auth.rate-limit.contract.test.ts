// tier: contract
// requires: supertest against an in-process app (nothing to start; every counted request is refused at validation, so no database and no hashing)
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createAuthThrottle } from '../../src/auth/authThrottle.js';
import { createTestApp } from '../support/createTestApp.js';

const RATE_LIMITED_BODY = {
  error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes.' },
};

// The real production limits, on a clock that never moves.
function limitedApp(hops = 0) {
  const throttle = createAuthThrottle({ now: () => 1_000_000 });
  return createTestApp({ authThrottle: throttle, trustProxyHops: hops });
}

async function post(
  app: ReturnType<typeof limitedApp>,
  path: string,
  forwardedFor?: string,
): Promise<request.Response> {
  const req = request(app).post(path).send({});
  return forwardedFor ? req.set('X-Forwarded-For', forwardedFor) : req;
}

describe('contract: sign-in is refused after 10 attempts from one address (AC-1)', () => {
  it('answers the 11th attempt with 429, the standard envelope and Retry-After', async () => {
    const app = limitedApp();
    for (let i = 0; i < 10; i += 1) {
      expect((await post(app, '/api/auth/login')).status).toBe(400);
    }
    const res = await post(app, '/api/auth/login');
    expect(res.status).toBe(429);
    expect(res.body).toEqual(RATE_LIMITED_BODY);
    expect(res.headers['retry-after']).toBe('900');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('leaves a normal user alone: the first attempts are answered, never throttled', async () => {
    const app = limitedApp();
    const res = await post(app, '/api/auth/login');
    expect(res.status).toBe(400);
    expect(res.headers['retry-after']).toBeUndefined();
  });
});

describe('contract: registration is refused after 5 attempts from one address (AC-2)', () => {
  it('answers the 6th attempt with the same 429 envelope and Retry-After, before the body is read', async () => {
    const app = limitedApp();
    for (let i = 0; i < 5; i += 1) {
      expect((await post(app, '/api/auth/register')).status).toBe(400);
    }
    const res = await post(app, '/api/auth/register');
    expect(res.status).toBe(429);
    expect(res.body).toEqual(RATE_LIMITED_BODY);
    expect(res.headers['retry-after']).toBe('3600');
  });

  it('counts register and sign-in separately', async () => {
    const app = limitedApp();
    for (let i = 0; i < 6; i += 1) await post(app, '/api/auth/register');
    expect((await post(app, '/api/auth/login')).status).toBe(400);
  });
});

describe('contract: the client address follows the configured proxy hops (R-1, DEC-306)', () => {
  it('with one trusted hop, each forwarded client address has its own limit', async () => {
    const app = limitedApp(1);
    for (let i = 0; i < 11; i += 1) await post(app, '/api/auth/login', '198.51.100.1');
    expect((await post(app, '/api/auth/login', '198.51.100.1')).status).toBe(429);
    expect((await post(app, '/api/auth/login', '198.51.100.2')).status).toBe(400);
  });

  it('with no trusted hop, a forged X-Forwarded-For cannot dodge the limit', async () => {
    const app = limitedApp(0);
    for (let i = 0; i < 10; i += 1) await post(app, '/api/auth/login', `203.0.113.${i + 1}`);
    expect((await post(app, '/api/auth/login', '203.0.113.99')).status).toBe(429);
  });
});

describe('contract: the production default wiring throttles without an injected throttle (AC-1)', () => {
  it('answers the 11th sign-in from createApp with 429', async () => {
    const app = createApp({ isDbConnected: () => true });
    for (let i = 0; i < 10; i += 1) {
      expect((await post(app, '/api/auth/login')).status).toBe(400);
    }
    expect((await post(app, '/api/auth/login')).status).toBe(429);
  });
});
