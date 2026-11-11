import { z } from 'zod';

const taskShape = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{24}$/),
  title: z.string().min(1),
  status: z.enum(['pending', 'completed']),
  createdAt: z.iso.datetime(),
});

/** Response contract for GET /api/tasks (EP-TASK-01): strict, so any extra field (ownerId, updatedAt) fails. */
export const listTasksSuccessSchema = z.strictObject({ tasks: z.array(taskShape) });

/** Response contract for POST /api/tasks (EP-TASK-02): a new task is always pending. */
export const createTaskSuccessSchema = z.strictObject({
  task: taskShape.extend({ status: z.literal('pending') }),
});

export const createTaskValidationSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal('VALIDATION'),
    message: z.string().min(1),
    fields: z.strictObject({
      title: z.enum(['Enter a title.', 'Titles can be at most 200 characters.']),
    }),
  }),
});

/** Response contract for PATCH /api/tasks/:id (EP-TASK-03): the same task shape, either status. */
export const updateTaskSuccessSchema = z.strictObject({ task: taskShape });

export const updateTaskValidationSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal('VALIDATION'),
    message: z.string().min(1),
    fields: z.partialRecord(
      z.enum(['title', 'status', 'body']),
      z.enum([
        'Enter a title.',
        'Titles can be at most 200 characters.',
        'Status must be pending or completed',
        'Provide a title or a status',
      ]),
    ),
  }),
});

export const notFoundSchema = z.strictObject({
  error: z.strictObject({ code: z.literal('NOT_FOUND'), message: z.literal('Task not found.') }),
});
