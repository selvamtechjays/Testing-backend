import { z } from 'zod';
import { addDays, addYears, isCalendarDate, utcToday } from './calendarDate.js';

export const TASK_STATUSES = ['pending', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = (typeof PRIORITIES)[number];

/** How far ahead a due date may be, counted from the server's UTC date (DEC-211). */
const DUE_DATE_MAX_YEARS = 5;

// Messages are shared verbatim with the UI.
export const TASK_FIELD_MESSAGES = {
  dueDateInvalid: 'Due date must be a real date in YYYY-MM-DD form.',
  dueDateTooFar: `Due date can be at most ${DUE_DATE_MAX_YEARS} years ahead.`,
  priority: 'Priority must be low, medium or high.',
} as const;

/** A task priority: one of low, medium or high. */
export const prioritySchema = z.enum(PRIORITIES, { error: TASK_FIELD_MESSAGES.priority });

/**
 * A due date: a real `YYYY-MM-DD` calendar date, past dates allowed, no later than the server's UTC date plus
 * 5 years plus 1 day. The extra day means nobody is refused a date within 5 years of their own today, whatever
 * their zone (DEC-211). The clock is injected so the limit is testable.
 */
export function dueDateSchema(now: Date) {
  const latest = addDays(addYears(utcToday(now), DUE_DATE_MAX_YEARS), 1);
  return z
    .string({ error: TASK_FIELD_MESSAGES.dueDateInvalid })
    .refine(isCalendarDate, { message: TASK_FIELD_MESSAGES.dueDateInvalid, abort: true })
    .refine((date) => date <= latest, { message: TASK_FIELD_MESSAGES.dueDateTooFar });
}
