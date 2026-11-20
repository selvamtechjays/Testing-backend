/** The only tag id shape the API accepts: 24 hex characters. Anything else is "not your tag". */
export const TAG_ID_PATTERN = /^[0-9a-f]{24}$/i;

/** The message for a tag that is missing, malformed or owned by someone else: all three look the same. */
export const TAG_NOT_FOUND = 'Tag not found.';
