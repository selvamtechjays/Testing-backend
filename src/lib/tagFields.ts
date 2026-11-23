import { z } from 'zod';

export const TAG_COLOURS = ['gray', 'red', 'orange', 'green', 'blue', 'purple'] as const;
export type TagColour = (typeof TAG_COLOURS)[number];

export const DEFAULT_COLOUR: TagColour = 'gray';
export const TAG_NAME_MAX = 30;
/** How many tags one user may hold; also the number of storage slots (DEC-261). */
export const TAG_LIMIT = 50;

// Messages are shared verbatim with the UI.
export const TAG_MESSAGES = {
  nameRequired: 'Enter a tag name.',
  nameTooLong: `Tag names can be at most ${TAG_NAME_MAX} characters.`,
  nameType: 'Tag name must be text.',
  nameTaken: 'You already have a tag with that name.',
  limitReached: `You can have up to ${TAG_LIMIT} tags.`,
  busy: 'Could not save the tag right now. Please try again.',
  colour: 'Colour must be gray, red, orange, green, blue or purple.',
  updateEmpty: 'Provide a name or a colour.',
} as const;

/**
 * A tag name: trimmed at the ends only, then 1 to 30 UTF-16 code units, counted the way task titles are, so an
 * emoji counts as two. A missing value is "required"; a value that is not text is "type". Any text is allowed
 * and kept as typed. Shared by create and rename, so the rule lives in one place.
 */
export const tagNameSchema = z
  .string({
    error: (issue) =>
      issue.input === undefined ? TAG_MESSAGES.nameRequired : TAG_MESSAGES.nameType,
  })
  .trim()
  .min(1, TAG_MESSAGES.nameRequired)
  // `.max()` counts code points; the length rule is UTF-16 code units, like task titles and the client.
  .refine((name) => name.length <= TAG_NAME_MAX, TAG_MESSAGES.nameTooLong);

/** A tag colour: one of the six. */
export const tagColourSchema = z.enum(TAG_COLOURS, { error: TAG_MESSAGES.colour });

/** Body of POST /api/tags. Other keys (ownerId, slot, ...) are stripped, so they can never be written. */
export const createTagSchema = z.object({
  name: tagNameSchema,
  colour: tagColourSchema.optional(),
});

export type NewTagInput = z.output<typeof createTagSchema>;

/**
 * Body of PATCH /api/tags/:id: an optional name and an optional colour, each under the same rule as create. Other
 * keys are stripped, so ownerId and slot can never be written; a body with neither field is refused under `body`.
 */
export const updateTagSchema = z
  .object({
    name: tagNameSchema.optional(),
    colour: tagColourSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.colour !== undefined, {
    message: TAG_MESSAGES.updateEmpty,
    path: ['body'],
  });

export type TagChanges = z.output<typeof updateTagSchema>;
