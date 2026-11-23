// tier: unit
// requires: nothing (pure id resolution and the async-local request context)
import { describe, expect, it } from 'vitest';
import { currentRequestId, runWithRequestId } from '../../src/lib/requestContext.js';
import { resolveRequestId } from '../../src/middleware/requestId.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveRequestId (AC-5, DEC-308)', () => {
  it.each(['abc123', 'req_1.2-3', 'A'.repeat(128), '3f2c9a0e-1b7d-4c55-9d3e-0a1b2c3d4e5f'])(
    'reuses the well-formed incoming id %s',
    (incoming) => {
      expect(resolveRequestId(incoming)).toBe(incoming);
    },
  );

  it.each([
    ['empty', ''],
    ['too long', 'A'.repeat(129)],
    ['space', 'two words'],
    ['newline', 'abc\r\nSet-Cookie: x=1'],
    ['markup', '<script>'],
    ['comma list from a repeated header', 'a, b'],
  ])('replaces a malformed incoming id (%s) with a generated UUID', (_name, incoming) => {
    const id = resolveRequestId(incoming);
    expect(id).toMatch(UUID);
    expect(id).not.toBe(incoming);
  });

  it('generates a UUID when there is no incoming id, and a new one each time', () => {
    const first = resolveRequestId(undefined);
    expect(first).toMatch(UUID);
    expect(resolveRequestId(undefined)).not.toBe(first);
  });
});

describe('request context (AC-6)', () => {
  it('holds the id across awaits inside the run and nothing outside it', async () => {
    expect(currentRequestId()).toBeUndefined();
    const seen = await runWithRequestId('ctx-1', async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return currentRequestId();
    });
    expect(seen).toBe('ctx-1');
    expect(currentRequestId()).toBeUndefined();
  });

  it('keeps two concurrent runs apart', async () => {
    const read = (id: string, delayMs: number) =>
      runWithRequestId(id, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return currentRequestId();
      });
    expect(await Promise.all([read('slow', 20), read('fast', 1)])).toEqual(['slow', 'fast']);
  });
});
