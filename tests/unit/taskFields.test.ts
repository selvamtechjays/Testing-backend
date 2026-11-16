// tier: unit
// requires: nothing (pure schema checks; no DB, no network)
import { describe, expect, it } from 'vitest';
import {
  PRIORITIES,
  TASK_FIELD_MESSAGES,
  dueDateSchema,
  prioritySchema,
} from '../../src/lib/taskFields.js';

const NOW = new Date('2026-11-16T12:00:00.000Z');

function refusal(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  if (result.success) throw new Error('expected the value to be refused');
  return result.error?.issues.map((issue) => issue.message);
}

describe('priority rule (AC-4)', () => {
  it('accepts low, medium and high', () => {
    expect([...PRIORITIES]).toEqual(['low', 'medium', 'high']);
    for (const value of PRIORITIES) expect(prioritySchema.parse(value)).toBe(value);
  });

  it('refuses "urgent", other cases and non-strings with the priority message (AC-4)', () => {
    for (const value of ['urgent', 'High', '', 3, null]) {
      const result = prioritySchema.safeParse(value);
      expect(result.success, String(value)).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(TASK_FIELD_MESSAGES.priority);
    }
  });
});

describe('due date rule (AC-4, DEC-211)', () => {
  const schema = dueDateSchema(NOW);

  it('accepts a real date, today and a past date', () => {
    for (const date of ['2026-11-20', '2026-11-16', '2020-01-01']) {
      expect(schema.parse(date)).toBe(date);
    }
  });

  it('refuses 2026-02-30, "tomorrow" and non-strings as not a real date (AC-4)', () => {
    for (const value of ['2026-02-30', 'tomorrow', '', 20261120, true]) {
      expect(refusal(schema.safeParse(value)), String(value)).toEqual([
        TASK_FIELD_MESSAGES.dueDateInvalid,
      ]);
    }
  });

  it('accepts up to the server UTC date plus 5 years plus 1 day, and no later', () => {
    expect(schema.parse('2031-11-16')).toBe('2031-11-16');
    expect(schema.parse('2031-11-17')).toBe('2031-11-17');
    expect(refusal(schema.safeParse('2031-11-18'))).toEqual([TASK_FIELD_MESSAGES.dueDateTooFar]);
  });

  it('refuses a due date 6 years ahead as too far (AC-4)', () => {
    expect(refusal(schema.safeParse('2032-11-16'))).toEqual([TASK_FIELD_MESSAGES.dueDateTooFar]);
  });

  it('measures the limit from the injected clock, not the wall clock', () => {
    const later = dueDateSchema(new Date('2030-01-01T00:00:00.000Z'));
    expect(later.parse('2035-01-02')).toBe('2035-01-02');
    expect(refusal(later.safeParse('2035-01-03'))).toEqual([TASK_FIELD_MESSAGES.dueDateTooFar]);
  });
});
