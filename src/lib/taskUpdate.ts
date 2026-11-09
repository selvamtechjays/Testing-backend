import { z } from 'zod';
import { taskTitleSchema } from './taskTitle.js';

// Messages are shared verbatim with the UI (DEC-118).
export const UPDATE_MESSAGES = {
  status: 'Status must be pending or completed',
  empty: 'Provide a title or a status',
} as const;

/**
 * Body of PATCH /api/tasks/:id: an optional title (same rule as add) and an optional status. Other keys are
 * stripped, so ownerId and createdAt can never be written; a body with neither field is refused.
 */
export const updateTaskSchema = z
  .object({
    title: taskTitleSchema.optional(),
    status: z.enum(['pending', 'completed'], { error: UPDATE_MESSAGES.status }).optional(),
  })
  .refine((body) => body.title !== undefined || body.status !== undefined, {
    message: UPDATE_MESSAGES.empty,
    path: ['body'],
  });

export type UpdateTaskInput = z.output<typeof updateTaskSchema>;
