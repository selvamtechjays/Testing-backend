// tier: unit
// requires: nothing (pure date arithmetic; no DB, no network)
import { afterEach, describe, expect, it } from 'vitest';
import {
  addDays,
  addDaysCapped,
  addYears,
  isCalendarDate,
  utcToday,
} from '../../src/lib/calendarDate.js';

describe('calendar date check (DEC-214, AC-4)', () => {
  it('accepts real YYYY-MM-DD dates, including a leap day', () => {
    for (const date of ['2026-11-20', '2024-02-29', '0050-06-01', '2026-12-31']) {
      expect(isCalendarDate(date), date).toBe(true);
    }
  });

  it('refuses a day that does not exist (AC-4)', () => {
    for (const date of ['2026-02-30', '2025-02-29', '2026-04-31', '2026-13-01', '2026-00-10']) {
      expect(isCalendarDate(date), date).toBe(false);
    }
  });

  it('refuses text that is not in YYYY-MM-DD form (AC-4)', () => {
    const text = ['tomorrow', '', '2026-2-3', '20261120', '2026-11-20T00:00:00Z', '2026-11-20\n'];
    for (const date of text) expect(isCalendarDate(date), JSON.stringify(date)).toBe(false);
  });
});

describe('calendar date arithmetic (DEC-214)', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-11-16', 6)).toBe('2026-11-22');
    expect(addDays('2026-11-16', 7)).toBe('2026-11-23');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(addDays('2026-11-16', 0)).toBe('2026-11-16');
    expect(addDays('2026-11-16', -16)).toBe('2026-10-31');
  });

  it('adds years and moves a missing leap day to 1 March', () => {
    expect(addYears('2026-11-16', 5)).toBe('2031-11-16');
    expect(addYears('2024-02-29', 1)).toBe('2025-03-01');
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
  });

  it('refuses to do arithmetic on something that is not a date', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => addYears('nope', 1)).toThrow(RangeError);
  });

  it('reads the UTC date of an instant', () => {
    expect(utcToday(new Date('2026-11-16T00:00:00.000Z'))).toBe('2026-11-16');
    expect(utcToday(new Date('2026-11-16T23:59:59.999Z'))).toBe('2026-11-16');
    expect(utcToday(new Date('2026-11-17T00:00:00.000Z'))).toBe('2026-11-17');
  });
});

describe('adding days without leaving the date range', () => {
  it('adds days like addDays away from the last date', () => {
    expect(addDaysCapped('2026-11-16', 6)).toBe('2026-11-22');
  });

  it('stops at 9999-12-31 instead of a five-digit year that would sort first', () => {
    expect(addDays('9999-12-30', 6)).toBe('10000-01-05');
    expect(addDaysCapped('9999-12-30', 6)).toBe('9999-12-31');
    expect(addDaysCapped('9999-12-31', 6)).toBe('9999-12-31');
  });
});

describe('a date never shifts with the machine time zone (AC-9, R-1)', () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it('gives the same strings in UTC-8 and UTC+10', () => {
    for (const zone of ['America/Los_Angeles', 'Australia/Brisbane', 'UTC']) {
      process.env.TZ = zone;
      expect(isCalendarDate('2026-11-20'), zone).toBe(true);
      expect(addDays('2026-11-20', 0), zone).toBe('2026-11-20');
      expect(addDays('2026-11-20', 1), zone).toBe('2026-11-21');
      expect(utcToday(new Date('2026-11-16T07:00:00.000Z')), zone).toBe('2026-11-16');
    }
  });
});
