import { z } from 'zod';

export const TITLE_MAX = 200;

// Messages are shared verbatim with the UI (DEC-115). Length counts UTF-16 code units, like the client.
export const TITLE_MESSAGES = {
  required: 'Enter a title.',
  tooLong: 'Titles can be at most 200 characters.',
} as const;

/**
 * A task title: trimmed, then 1 to 200 characters. A whitespace-only or missing title is "empty" (DEC-062).
 * Shared by every task operation that accepts a title, so the rule lives in one place.
 */
export const taskTitleSchema = z
  .string({ error: TITLE_MESSAGES.required })
  .trim()
  .min(1, TITLE_MESSAGES.required)
  .max(TITLE_MAX, TITLE_MESSAGES.tooLong);
