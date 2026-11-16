// tier: unit
// requires: nothing (pure schema checks; no DB, no network)
import { describe, expect, it } from 'vitest';
import { parseBody } from '../../src/lib/parseBody.js';
import {
  LIST_QUERY_MESSAGES,
  SEARCH_MAX,
  SEARCH_MESSAGES,
  listQuerySchema,
} from '../../src/lib/taskSearch.js';

/** Every refused query key with its first message, for a query that may break several rules. */
function refusedKeys(query: unknown): Record<string, string> {
  const result = listQuerySchema.safeParse(query);
  if (result.success) throw new Error('expected the query to be refused');
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues)
    fields[issue.path.map(String).join('.')] ??= issue.message;
  return fields;
}

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

describe('task list filter query rule (EP-TASK-01, Task-23)', () => {
  it('accepts every filter, the sort and today together with search (AC-7)', () => {
    const query = {
      search: 'milk',
      status: 'pending',
      priority: 'high',
      due: 'week',
      sort: 'due',
      today: '2026-11-16',
    };
    expect(parseBody(listQuerySchema, query)).toEqual(query);
  });

  it('leaves every filter unset when the keys are missing', () => {
    expect(parseBody(listQuerySchema, {})).toEqual({});
  });

  it('refuses a value outside each list, naming the key with its message', () => {
    expect(refusedKeys({ status: 'done' })).toEqual({ status: LIST_QUERY_MESSAGES.status });
    expect(refusedKeys({ priority: 'urgent' })).toEqual({ priority: LIST_QUERY_MESSAGES.priority });
    expect(refusedKeys({ due: 'soon' })).toEqual({ due: LIST_QUERY_MESSAGES.due });
    expect(refusedKeys({ sort: 'oldest' })).toEqual({ sort: LIST_QUERY_MESSAGES.sort });
  });

  it('refuses an empty value and a nested value as outside the list', () => {
    expect(refusedKeys({ status: '' })).toEqual({ status: LIST_QUERY_MESSAGES.status });
    expect(refusedKeys({ sort: { $ne: 'due' } })).toEqual({ sort: LIST_QUERY_MESSAGES.sort });
  });

  it('refuses a repeated key under its own name with the single-value message', () => {
    const expected = {
      status: 'Status must be a single value.',
      priority: 'Priority must be a single value.',
      due: 'Due filter must be a single value.',
      sort: 'Sort must be a single value.',
      today: 'Today must be a single value.',
    } as const;
    for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
      expect(refusedKeys({ today: '2026-11-16', [key]: ['a', 'b'] }), key).toEqual({
        [key]: expected[key],
      });
    }
  });

  it('shares the status and priority messages with the update and create rules', () => {
    expect(LIST_QUERY_MESSAGES.status).toBe('Status must be pending or completed');
    expect(LIST_QUERY_MESSAGES.priority).toBe('Priority must be low, medium or high.');
  });

  it('reports a refused field and the missing today together', () => {
    expect(refusedKeys({ due: 'week', status: 'bogus' })).toEqual({
      status: LIST_QUERY_MESSAGES.status,
      today: LIST_QUERY_MESSAGES.todayRequired,
    });
  });

  it('refuses a today that is not a real date', () => {
    for (const today of ['2026-02-30', 'now', '']) {
      expect(refusedKeys({ today }), JSON.stringify(today)).toEqual({
        today: LIST_QUERY_MESSAGES.todayInvalid,
      });
    }
  });

  it('accepts today on its own, with no due filter (DEC-218)', () => {
    expect(parseBody(listQuerySchema, { today: '2026-11-16' })).toEqual({ today: '2026-11-16' });
  });

  it('refuses overdue, today and week without today, naming today (AC-8)', () => {
    for (const due of ['overdue', 'today', 'week']) {
      expect(refusedKeys({ due }), due).toEqual({ today: LIST_QUERY_MESSAGES.todayRequired });
    }
  });

  it('accepts the none filter without today (AC-8)', () => {
    expect(parseBody(listQuerySchema, { due: 'none' })).toEqual({ due: 'none' });
  });
});
