// A calendar date is a `YYYY-MM-DD` string with no time and no zone (DEC-214). Every helper here reads and
// writes that string through UTC arithmetic only, so a date can never shift with the machine's time zone.

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Milliseconds since the epoch for a UTC midnight; `Date.UTC` alone would read years 0-99 as 1900-1999. */
function utcMidnight(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
}

function formatUtc(ms: number): string {
  const date = new Date(ms);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(text: string): number | undefined {
  const match = DATE_PATTERN.exec(text);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = utcMidnight(year, month, day);
  // A day that does not exist (2026-02-30) rolls into the next month, so it no longer prints back the same.
  return formatUtc(ms) === text ? ms : undefined;
}

/** True only for a real `YYYY-MM-DD` calendar date: `2026-02-30`, `tomorrow` and `2026-2-3` are all refused. */
export function isCalendarDate(text: string): boolean {
  return parseDate(text) !== undefined;
}

/** The date `days` after (or before, if negative) a valid calendar date. */
export function addDays(date: string, days: number): string {
  const ms = parseDate(date);
  if (ms === undefined) throw new RangeError(`Not a calendar date: ${date}`);
  return formatUtc(ms + days * MS_PER_DAY);
}

const LAST_DATE = '9999-12-31';

/** Like `addDays`, but never past 9999-12-31: a fifth year digit would sort before every real date as text. */
export function addDaysCapped(date: string, days: number): string {
  const result = addDays(date, days);
  return result > LAST_DATE || result.length > LAST_DATE.length ? LAST_DATE : result;
}

/** The same month and day `years` later; 29 February in a year with no leap day becomes 1 March. */
export function addYears(date: string, years: number): string {
  const ms = parseDate(date);
  if (ms === undefined) throw new RangeError(`Not a calendar date: ${date}`);
  const source = new Date(ms);
  return formatUtc(
    utcMidnight(source.getUTCFullYear() + years, source.getUTCMonth() + 1, source.getUTCDate()),
  );
}

/** The UTC calendar date of an instant: the server's own "today", used only to bound a due date (DEC-211). */
export function utcToday(now: Date): string {
  return formatUtc(now.getTime());
}
