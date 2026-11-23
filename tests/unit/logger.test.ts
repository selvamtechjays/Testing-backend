// tier: unit
// requires: nothing (the logger writes to an in-memory destination)
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/lib/logger.js';
import { runWithRequestId } from '../../src/lib/requestContext.js';
import { createLogLines } from '../support/logLines.js';

describe('structured logger (AC-6, DEC-309)', () => {
  it('writes one JSON object per line with level, ISO time and message', () => {
    const lines = createLogLines();
    createLogger('info', lines.stream).info({ port: 4000 }, 'API listening');
    const [line] = lines.parsed();
    expect(line.msg).toBe('API listening');
    expect(line.port).toBe(4000);
    expect(line.level).toBe(30);
    expect(String(line.time)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(lines.raw().trim().split('\n')).toHaveLength(1);
  });

  it('adds the current request id to every line written inside a request', () => {
    const lines = createLogLines();
    const logger = createLogger('info', lines.stream);
    runWithRequestId('req-abc', () => {
      logger.info('one');
      logger.warn('two');
    });
    logger.info('outside');
    const [one, two, outside] = lines.parsed();
    expect(one.requestId).toBe('req-abc');
    expect(two.requestId).toBe('req-abc');
    expect(outside.requestId).toBeUndefined();
  });

  it('serialises an error with its message and stack', () => {
    const lines = createLogLines();
    createLogger('info', lines.stream).error({ err: new Error('boom') }, 'failed');
    const [line] = lines.parsed();
    expect(line.err?.message).toBe('boom');
    expect(line.err?.stack).toContain('Error: boom');
  });

  it('redacts password, passwordHash, authorization, cookie, set-cookie and sessionId at each of three depths', () => {
    const keys = ['password', 'passwordHash', 'authorization', 'cookie', 'set-cookie', 'sessionId'];
    const secrets: string[] = [];
    const entry: Record<string, unknown> = {};
    const nested: Record<string, unknown> = {};
    const deep: Record<string, unknown> = {};
    for (const key of keys) {
      secrets.push(`top-${key}-secret`, `mid-${key}-secret`, `low-${key}-secret`);
      entry[key] = `top-${key}-secret`;
      nested[key] = `mid-${key}-secret`;
      deep[key] = `low-${key}-secret`;
    }
    const lines = createLogLines();
    createLogger('info', lines.stream).info(
      { ...entry, one: nested, two: { three: deep } },
      'sensitive',
    );
    const raw = lines.raw();
    for (const secret of secrets) expect(raw).not.toContain(secret);
    expect(raw.split('[Redacted]')).toHaveLength(keys.length * 3 + 1);
  });

  it('drops lines below the configured level', () => {
    const lines = createLogLines();
    const logger = createLogger('warn', lines.stream);
    logger.info('quiet');
    logger.warn('loud');
    expect(lines.parsed().map((line) => line.msg)).toEqual(['loud']);
  });
});
