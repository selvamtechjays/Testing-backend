import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build } from './builders.js';
import { createTestApp } from './createTestApp.js';
import { stubRandom, useFakeClock } from './mocks.js';

describe('test support harness (smoke)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('createTestApp serves the health route', async () => {
    const res = await request(createTestApp()).get('/api/health');
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });

  it('build returns independent objects with overrides applied', () => {
    const defaults = { name: 'a', tags: ['x'] };
    const one = build(defaults, { name: 'b' });
    const two = build(defaults);
    one.tags.push('y');
    expect(one.name).toBe('b');
    expect(two.tags).toEqual(['x']);
  });

  it('useFakeClock freezes time', () => {
    useFakeClock('2026-01-01T00:00:00.000Z');
    expect(new Date().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('stubRandom yields the given sequence', () => {
    stubRandom([0.1, 0.9]);
    expect([Math.random(), Math.random(), Math.random()]).toEqual([0.1, 0.9, 0.9]);
  });
});
