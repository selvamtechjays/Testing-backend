import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

describe('GET /api/health', () => {
  it('returns ok with the injected db state', async () => {
    const app = createApp({ isDbConnected: () => false });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'disconnected' });
  });

  it('returns 404 JSON for unknown routes', async () => {
    const app = createApp({ isDbConnected: () => true });
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('/api/nope');
  });
});

describe('loadConfig', () => {
  it('applies defaults when env is empty', () => {
    expect(loadConfig({})).toEqual({
      port: 4000,
      mongodbUri: 'mongodb://localhost:27017/testing-delivery-os',
      nodeEnv: 'development',
    });
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow('Invalid PORT');
  });
});
