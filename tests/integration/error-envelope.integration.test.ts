// tier: integration
// requires: mongodb-memory-server (in-process, started by tests/integration/globalSetup.ts)
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createErrorApp } from '../support/errorApp.js';

describe('error envelope against a real Mongo connection (AC-3..AC-8)', () => {
  it('a handler that fails a real database write returns the 500 envelope without driver details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = createErrorApp(async () => {
      const col = mongoose.connection.collection<{ _id: string }>('envelope_probe');
      await col.insertOne({ _id: 'same' });
      await col.insertOne({ _id: 'same' });
    });
    const res = await request(app).post('/api/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
    expect(res.text).not.toContain('E11000');
    expect(res.text).not.toContain('envelope_probe');
  });

  it('a real server-selection failure returns the 503 envelope', async () => {
    const conn = mongoose.createConnection('mongodb://127.0.0.1:1/none', {
      serverSelectionTimeoutMS: 300,
    });
    const app = createErrorApp(async () => {
      await conn.asPromise();
    });
    const res = await request(app).post('/api/boom');
    await conn.close().catch(() => undefined);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
    });
  });

  it('a request that succeeds against the database is untouched by the handler', async () => {
    const app = createErrorApp(async (_req, res) => {
      await mongoose.connection.collection('envelope_probe').insertOne({ ok: true });
      res.status(201).json({ ok: true });
    });
    const res = await request(app).post('/api/boom');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });
});
