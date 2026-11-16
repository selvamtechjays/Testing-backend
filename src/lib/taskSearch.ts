import { z } from 'zod';
import { isCalendarDate } from './calendarDate.js';
import { PRIORITIES, TASK_FIELD_MESSAGES, TASK_STATUSES } from './taskFields.js';
import { UPDATE_MESSAGES } from './taskUpdate.js';

export const SEARCH_MAX = 100;

const DUE_FILTERS = ['overdue', 'today', 'week', 'none'] as const;
const SORT_ORDERS = ['newest', 'due', 'priority'] as const;

// Messages are shared verbatim with the UI (DEC-208). Length counts UTF-16 code units, like the client.
export const SEARCH_MESSAGES = {
  single: 'Search text must be a single value.',
  tooLong: 'Search text can be at most 100 characters.',
} as const;

export const LIST_QUERY_MESSAGES = {
  status: UPDATE_MESSAGES.status,
  priority: TASK_FIELD_MESSAGES.priority,
  due: 'Due filter must be overdue, today, week or none.',
  sort: 'Sort must be newest, due or priority.',
  todayInvalid: 'Today must be a real date in YYYY-MM-DD form.',
  todayRequired: "Send today's date with this due filter.",
} as const;

/** A repeated key arrives as a list; it is refused under its own name, as `search` is. */
export const LIST_QUERY_SINGLE_MESSAGES = {
  status: 'Status must be a single value.',
  priority: 'Priority must be a single value.',
  due: 'Due filter must be a single value.',
  sort: 'Sort must be a single value.',
  today: 'Today must be a single value.',
} as const;

/** The refusal message for a key: its single-value message for a repeated key, otherwise its invalid-value one. */
function messageFor(single: string, invalid: string) {
  return (issue: { input?: unknown }) => (Array.isArray(issue.input) ? single : invalid);
}

/**
 * The query string of `GET /api/tasks`. Every key is optional and must be a single value; a repeated key
 * (`?search=a&search=b`) arrives as a list and is refused under its own name.
 *  - `search`: trimmed, then at most 100 characters; missing, empty or whitespace-only means "no search".
 *  - `status`, `priority`, `due`, `sort`: one value from their list; a missing key means "all" / `newest`.
 *  - `today`: the caller's local date, a real `YYYY-MM-DD`; the server never uses its own clock for it (DEC-218).
 * A due filter of overdue, today or week without `today` is refused under `today`. Unknown keys are stripped.
 */
export const listQuerySchema = z
  .object({
    search: z
      .string({ error: SEARCH_MESSAGES.single })
      .trim()
      .max(SEARCH_MAX, SEARCH_MESSAGES.tooLong)
      .transform((text) => (text === '' ? undefined : text))
      .optional(),
    status: z
      .enum(TASK_STATUSES, {
        error: messageFor(LIST_QUERY_SINGLE_MESSAGES.status, LIST_QUERY_MESSAGES.status),
      })
      .optional(),
    priority: z
      .enum(PRIORITIES, {
        error: messageFor(LIST_QUERY_SINGLE_MESSAGES.priority, LIST_QUERY_MESSAGES.priority),
      })
      .optional(),
    due: z
      .enum(DUE_FILTERS, {
        error: messageFor(LIST_QUERY_SINGLE_MESSAGES.due, LIST_QUERY_MESSAGES.due),
      })
      .optional(),
    sort: z
      .enum(SORT_ORDERS, {
        error: messageFor(LIST_QUERY_SINGLE_MESSAGES.sort, LIST_QUERY_MESSAGES.sort),
      })
      .optional(),
    today: z
      .string({
        error: messageFor(LIST_QUERY_SINGLE_MESSAGES.today, LIST_QUERY_MESSAGES.todayInvalid),
      })
      .refine(isCalendarDate, { message: LIST_QUERY_MESSAGES.todayInvalid })
      .optional(),
  })
  // `when` keeps this check running beside a refused field, so `?due=week&status=bogus` reports both. A refused
  // `due` value stays in the checked data, so only a real date filter asks for `today`.
  .refine(
    (query) =>
      query.due === undefined ||
      query.due === 'none' ||
      !DUE_FILTERS.includes(query.due) ||
      query.today !== undefined,
    { message: LIST_QUERY_MESSAGES.todayRequired, path: ['today'], when: () => true },
  );

export type ListQuery = z.infer<typeof listQuerySchema>;
