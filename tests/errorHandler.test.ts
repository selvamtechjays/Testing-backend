import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/lib/apiError.js';
import { HttpError } from '../src/middleware/errorHandler.js';
import { createErrorApp } from './support/errorApp.js';

function appThrowing(err: unknown, limit?: string) {
  return createErrorApp(() => {
    throw err;
  }, limit);
}

function namedError(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

describe('errorHandler envelope (BR-3, AC-8)', () => {
  it('writes an ApiError with its own status, code and message', async () => {
    const res = await request(appThrowing(new ApiError(404, 'NOT_FOUND', 'Task not found'))).post(
      '/api/boom',
    );
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Task not found' } });
  });

  it('includes fields only when the ApiError carries them', async () => {
    const err = new ApiError(400, 'VALIDATION', 'Validation failed', { title: 'Enter a title.' });
    const res = await request(appThrowing(err)).post('/api/boom');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION',
        message: 'Validation failed',
        fields: { title: 'Enter a title.' },
      },
    });
  });

  it('keeps HttpError as an alias that still produces the envelope', async () => {
    const res = await request(
      appThrowing(new HttpError(401, 'UNAUTHENTICATED', 'Sign in required')),
    ).post('/api/boom');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('maps unparseable JSON to 400 BAD_REQUEST (AC-8)', async () => {
    const res = await request(appThrowing(new Error('unused')))
      .post('/api/boom')
      .set('Content-Type', 'application/json')
      .send('{"title": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON' },
    });
  });

  it('maps an oversized body to 400 BAD_REQUEST', async () => {
    const res = await request(appThrowing(new Error('unused'), '1kb'))
      .post('/api/boom')
      .send({ title: 'x'.repeat(5000) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'BAD_REQUEST', message: 'Request body is too large' },
    });
  });

  it('maps the unmatched route to 404 NOT_FOUND', async () => {
    const res = await request(createErrorApp(() => undefined)).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  it.each([
    'MongoNetworkError',
    'MongoNetworkTimeoutError',
    'MongoServerSelectionError',
    'MongoTimeoutError',
    'MongooseServerSelectionError',
  ])('maps %s to 503 SERVICE_UNAVAILABLE', async (name) => {
    const res = await request(appThrowing(namedError(name, 'connect ECONNREFUSED db:27017'))).post(
      '/api/boom',
    );
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
    });
    expect(res.text).not.toContain('ECONNREFUSED');
  });

  it('maps any other error to a generic 500 and logs the original', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const original = new Error('E11000 duplicate key in collection tasks');
    const res = await request(appThrowing(original)).post('/api/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
    expect(res.text).not.toContain('tasks');
    expect(spy).toHaveBeenCalledWith(original);
  });

  it('has exactly one top-level key and never exposes internals', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(appThrowing(new Error('secret detail'))).post('/api/boom');
    expect(Object.keys(res.body)).toEqual(['error']);
    expect(res.text).not.toContain('secret detail');
    expect(res.text).not.toContain('.ts:');
  });
});
