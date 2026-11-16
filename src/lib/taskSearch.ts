import { z } from 'zod';

export const SEARCH_MAX = 100;

// Messages are shared verbatim with the UI (DEC-208). Length counts UTF-16 code units, like the client.
export const SEARCH_MESSAGES = {
  single: 'Search text must be a single value.',
  tooLong: 'Search text can be at most 100 characters.',
} as const;

/**
 * The query string of `GET /api/tasks`: an optional `search` that must be a single string, trimmed, then at most
 * 100 characters. A missing, empty or whitespace-only value resolves to `undefined` ("no search"). Unknown query
 * keys are stripped, never an error. A repeated key (`?search=a&search=b`) arrives as a list and is refused.
 */
export const listQuerySchema = z.object({
  search: z
    .string({ error: SEARCH_MESSAGES.single })
    .trim()
    .max(SEARCH_MAX, SEARCH_MESSAGES.tooLong)
    .transform((text) => (text === '' ? undefined : text))
    .optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
