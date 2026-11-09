/** The only task id shape the API accepts: 24 hex characters. Anything else is "not found". */
export const TASK_ID_PATTERN = /^[0-9a-f]{24}$/i;

/** The message for a task that is missing, malformed or owned by someone else: all three look the same. */
export const TASK_NOT_FOUND = 'Task not found.';
