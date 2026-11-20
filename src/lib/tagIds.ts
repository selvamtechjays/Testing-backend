import { z } from 'zod';
import { TAG_ID_PATTERN } from './tagId.js';

/** A task carries at most this many distinct tags, counted after duplicates are merged (BR-2). */
export const TASK_TAG_LIMIT = 5;

// Messages are shared verbatim with the UI. An unknown, foreign or malformed id is one message, so the answer
// never tells which of the three it was (BR-3).
export const TAG_IDS_MESSAGES = {
  own: 'Tags must be your own tags.',
  tooMany: `A task can have up to ${TASK_TAG_LIMIT} tags.`,
} as const;

function isTagIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((id) => typeof id === 'string' && TAG_ID_PATTERN.test(id))
  );
}

/**
 * The tags on a task create or update: optional; a list of 24-hex id strings. A value that is not a list, an
 * entry that is not a string and a malformed id are the same single refusal under `tagIds`. Ids are compared
 * ignoring case and merged, so a repeat counts once; more than 5 distinct is its own refusal. An empty list is
 * valid and means "no tags". Ownership is checked against the tag library by the service, not here.
 */
export const tagIdsSchema = z
  .custom<string[]>(isTagIdList, { error: TAG_IDS_MESSAGES.own })
  .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))])
  .refine((ids) => ids.length <= TASK_TAG_LIMIT, TAG_IDS_MESSAGES.tooMany)
  .optional();
