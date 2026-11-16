// tier: unit
// requires: nothing (pure schema checks; no DB, no network)
import { describe, expect, it } from 'vitest';
import { parseBody } from '../../src/lib/parseBody.js';
import { NOTES_MAX, NOTES_MESSAGES, notesSchema } from '../../src/lib/taskNotes.js';

/** The one message the schema gives for a refused value. */
function refusal(value: unknown): string {
  const result = notesSchema.safeParse(value);
  if (result.success) throw new Error('expected the notes to be refused');
  return result.error.issues[0]?.message ?? '';
}

describe('task notes rule (Task-24, AC-1, AC-3, DEC-240)', () => {
  it('accepts text unchanged', () => {
    expect(parseBody(notesSchema, 'Call Ravi 98400 12345')).toBe('Call Ravi 98400 12345');
  });

  it('accepts notes of exactly 1000 characters (AC-3)', () => {
    const notes = 'x'.repeat(NOTES_MAX);
    expect(parseBody(notesSchema, notes)).toBe(notes);
  });

  it('refuses notes of 1001 characters with the too-long message (AC-3)', () => {
    expect(refusal('x'.repeat(NOTES_MAX + 1))).toBe(NOTES_MESSAGES.tooLong);
  });

  it('trims surrounding spaces before counting, so 1000 characters inside spaces pass', () => {
    const notes = 'x'.repeat(NOTES_MAX);
    expect(parseBody(notesSchema, `   ${notes}  \n`)).toBe(notes);
  });

  it('counts UTF-16 code units, so 501 emoji (1002 units) are refused', () => {
    expect(refusal('😀'.repeat(501))).toBe(NOTES_MESSAGES.tooLong);
    expect(parseBody(notesSchema, '😀'.repeat(500))).toBe('😀'.repeat(500));
  });

  it('turns an empty or whitespace-only value into null, meaning no notes (AC-3)', () => {
    expect(parseBody(notesSchema, '')).toBeNull();
    expect(parseBody(notesSchema, '   \n\t ')).toBeNull();
  });

  it('accepts null and a missing value, which are different from empty text', () => {
    expect(parseBody(notesSchema, null)).toBeNull();
    expect(parseBody(notesSchema, undefined)).toBeUndefined();
  });

  it('keeps newlines inside the text as typed', () => {
    expect(parseBody(notesSchema, ' line one\n\nline two ')).toBe('line one\n\nline two');
  });

  it('refuses anything that is not text with the type message', () => {
    for (const value of [0, 42, true, ['a'], { a: 1 }]) {
      expect(refusal(value), JSON.stringify(value)).toBe(NOTES_MESSAGES.type);
    }
  });

  it('keeps accents, CJK and markup intact as plain text', () => {
    const notes = 'Café 会議 <b>bold</b>';
    expect(parseBody(notesSchema, notes)).toBe(notes);
  });
});
