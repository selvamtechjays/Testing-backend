import { z } from 'zod';
import { TASK_STATUSES, dueDateSchema, prioritySchema } from './taskFields.js';
import { tagIdsSchema } from './tagIds.js';
import { notesSchema } from './taskNotes.js';
import { taskTitleSchema } from './taskTitle.js';

// Messages are shared verbatim with the UI (DEC-118).
export const UPDATE_MESSAGES = {
  status: 'Status must be pending or completed',
  empty: 'Provide a title, status, due date, priority, notes or tags',
} as const;

/**
 * Body of PATCH /api/tasks/:id: an optional title (same rule as add), status, due date (a date, or `null` to
 * clear it), priority, notes (text, or `null` to clear them) and tag ids (the whole new list; `[]` removes
 * every tag). Other keys are stripped, so ownerId and createdAt can never be written; a body with none of the
 * six fields is refused. The clock is injected for the due-date limit.
 */
export function createUpdateTaskSchema(now: Date) {
  return z
    .object({
      title: taskTitleSchema.optional(),
      status: z.enum(TASK_STATUSES, { error: UPDATE_MESSAGES.status }).optional(),
      dueDate: dueDateSchema(now).nullable().optional(),
      priority: prioritySchema.optional(),
      notes: notesSchema,
      tagIds: tagIdsSchema,
    })
    .refine(
      (body) =>
        body.title !== undefined ||
        body.status !== undefined ||
        body.dueDate !== undefined ||
        body.priority !== undefined ||
        body.notes !== undefined ||
        body.tagIds !== undefined,
      { message: UPDATE_MESSAGES.empty, path: ['body'] },
    );
}

export type UpdateTaskInput = z.output<ReturnType<typeof createUpdateTaskSchema>>;
