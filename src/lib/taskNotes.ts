import { z } from 'zod';

export const NOTES_MAX = 1000;

// Messages are shared verbatim with the UI (DEC-240). Length counts UTF-16 code units, like the client.
export const NOTES_MESSAGES = {
  type: 'Notes must be text.',
  tooLong: 'Notes can be at most 1000 characters.',
} as const;

/**
 * A task's notes: a string trimmed, then at most 1000 characters; an empty or whitespace-only value becomes
 * `null`, meaning no notes. `null` and a missing key are accepted too, so a body can clear notes or leave them
 * alone. Newlines inside the text are kept as typed (DEC-240). Shared by create and update, so the rule lives
 * in one place.
 */
export const notesSchema = z
  .string({ error: NOTES_MESSAGES.type })
  .trim()
  // `.max()` counts code points; the length rule is UTF-16 code units, like the client and the model.
  .refine((text) => text.length <= NOTES_MAX, NOTES_MESSAGES.tooLong)
  .transform((text) => (text === '' ? null : text))
  .nullable()
  .optional();
