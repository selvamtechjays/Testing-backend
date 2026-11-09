// tier: unit
// requires: nothing (pure schema checks; no DB, no network)
import { describe, expect, it } from 'vitest';
import { parseBody } from '../../src/lib/parseBody.js';
import { TITLE_MAX, TITLE_MESSAGES, taskTitleSchema } from '../../src/lib/taskTitle.js';

/** The one message the schema gives for a refused value. */
function refusal(value: unknown): string {
  const result = taskTitleSchema.safeParse(value);
  if (result.success) throw new Error('expected the title to be refused');
  return result.error.issues[0]?.message ?? '';
}

describe('task title rule (FEAT-TASK-01, BR-1, BR-2)', () => {
  it('accepts a title of one character', () => {
    expect(parseBody(taskTitleSchema, 'a')).toBe('a');
  });

  it('accepts a title of exactly 200 characters unchanged', () => {
    const title = 'x'.repeat(TITLE_MAX);
    expect(parseBody(taskTitleSchema, title)).toBe(title);
  });

  it('trims surrounding spaces before counting', () => {
    const title = 'x'.repeat(TITLE_MAX);
    expect(parseBody(taskTitleSchema, `  ${title}  `)).toBe(title);
    expect(parseBody(taskTitleSchema, '  Pay hosting invoice ')).toBe('Pay hosting invoice');
  });

  it('refuses a title of 201 characters with the too-long message', () => {
    expect(refusal('x'.repeat(TITLE_MAX + 1))).toBe(TITLE_MESSAGES.tooLong);
  });

  it('refuses an empty title with the required message', () => {
    expect(refusal('')).toBe(TITLE_MESSAGES.required);
  });

  it('treats a whitespace-only title as empty (DEC-062)', () => {
    expect(refusal('   \t ')).toBe(TITLE_MESSAGES.required);
  });

  it('treats a missing or non-string title as empty', () => {
    expect(refusal(undefined)).toBe(TITLE_MESSAGES.required);
    expect(refusal(42)).toBe(TITLE_MESSAGES.required);
  });

  it('keeps accents, CJK and emoji intact', () => {
    const title = 'Café 会議 🎉';
    expect(parseBody(taskTitleSchema, title)).toBe(title);
  });
});
