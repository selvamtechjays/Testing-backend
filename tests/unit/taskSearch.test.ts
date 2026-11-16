// tier: unit
// requires: nothing (pure schema checks; no DB, no network)
import { describe, expect, it } from 'vitest';
import { parseBody } from '../../src/lib/parseBody.js';
import { SEARCH_MAX, SEARCH_MESSAGES, listQuerySchema } from '../../src/lib/taskSearch.js';

/** The `fields.search` message the query rule gives for a refused query. */
function refusal(query: unknown): string {
  const result = listQuerySchema.safeParse(query);
  if (result.success) throw new Error('expected the query to be refused');
  return result.error.issues[0]?.message ?? '';
}

describe('task search query rule (EP-TASK-01, DEC-208)', () => {
  it('resolves a missing search to no search (AC-3)', () => {
    expect(parseBody(listQuerySchema, {}).search).toBeUndefined();
  });

  it('resolves an empty search to no search (AC-3)', () => {
    expect(parseBody(listQuerySchema, { search: '' }).search).toBeUndefined();
  });

  it('resolves a whitespace-only search to no search (AC-3)', () => {
    expect(parseBody(listQuerySchema, { search: '   \t ' }).search).toBeUndefined();
  });

  it('trims surrounding spaces from the search text', () => {
    expect(parseBody(listQuerySchema, { search: '  milk ' }).search).toBe('milk');
  });

  it('accepts search text of exactly 100 characters unchanged (AC-4)', () => {
    const text = 'x'.repeat(SEARCH_MAX);
    expect(parseBody(listQuerySchema, { search: text }).search).toBe(text);
  });

  it('counts the length after the trim, so padded 100-character text is accepted (AC-4)', () => {
    const text = 'x'.repeat(SEARCH_MAX);
    expect(parseBody(listQuerySchema, { search: `  ${text}  ` }).search).toBe(text);
  });

  it('refuses search text of 101 characters with the too-long message (AC-4)', () => {
    expect(refusal({ search: 'x'.repeat(SEARCH_MAX + 1) })).toBe(SEARCH_MESSAGES.tooLong);
  });

  it('refuses a repeated search key, which arrives as a list, with the single-value message', () => {
    expect(refusal({ search: ['a', 'b'] })).toBe(SEARCH_MESSAGES.single);
  });

  it('refuses a nested search value with the single-value message', () => {
    expect(refusal({ search: { $ne: '' } })).toBe(SEARCH_MESSAGES.single);
  });

  it('reports the failure under fields.search', () => {
    expect(() => parseBody(listQuerySchema, { search: ['a', 'b'] })).toThrowError(
      expect.objectContaining({
        status: 400,
        code: 'VALIDATION',
        fields: { search: SEARCH_MESSAGES.single },
      }),
    );
  });

  it('strips unknown query keys instead of refusing them', () => {
    expect(parseBody(listQuerySchema, { search: 'milk', page: '2', ownerId: 'x' })).toEqual({
      search: 'milk',
    });
  });

  it('keeps accents, CJK and emoji intact', () => {
    expect(parseBody(listQuerySchema, { search: 'Café 会議 🎉' }).search).toBe('Café 会議 🎉');
  });
});
