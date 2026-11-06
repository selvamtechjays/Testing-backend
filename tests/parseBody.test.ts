import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../src/lib/apiError.js';
import { parseBody } from '../src/lib/parseBody.js';

const schema = z.object({
  title: z.string().min(1, 'Enter a title.').max(200, 'Titles can be at most 200 characters.'),
  meta: z.object({ count: z.number('Must be a number.') }).optional(),
});

function thrown<T>(s: z.ZodType<T>, body: unknown): ApiError {
  try {
    parseBody(s, body);
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected parseBody to throw');
}

describe('parseBody (AC-3, AC-5)', () => {
  it('returns the parsed value on success', () => {
    expect(parseBody(schema, { title: 'Buy milk' })).toEqual({ title: 'Buy milk' });
  });

  it('throws ApiError 400 VALIDATION with a fields map', () => {
    const err = thrown(schema, { title: '' });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toBe('Validation failed');
    expect(err.fields).toEqual({ title: 'Enter a title.' });
  });

  it('joins nested paths with a dot', () => {
    expect(thrown(schema, { title: 'ok', meta: { count: 'x' } }).fields).toEqual({
      'meta.count': 'Must be a number.',
    });
  });

  it('keeps the first message when a field has several issues', () => {
    const multi = z.object({ title: z.string().min(3, 'first').regex(/^a/, 'second') });
    expect(thrown(multi, { title: 'b' }).fields).toEqual({ title: 'first' });
  });

  it('reports every failing field', () => {
    const two = z.object({ a: z.string('A bad'), b: z.string('B bad') });
    expect(thrown(two, {}).fields).toEqual({ a: 'A bad', b: 'B bad' });
  });
});
