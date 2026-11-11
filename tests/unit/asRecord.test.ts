// tier: unit
// requires: nothing (pure function)
import { describe, expect, it } from 'vitest';
import { asRecord } from '../../src/lib/asRecord.js';

describe('asRecord', () => {
  it('returns a plain object body unchanged', () => {
    const body = { title: 'x' };
    expect(asRecord(body)).toBe(body);
  });

  it.each([undefined, null, 'text', 5, ['a']])('turns %j into an empty object', (body) => {
    expect(asRecord(body)).toEqual({});
  });
});
