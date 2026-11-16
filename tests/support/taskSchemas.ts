import { z } from 'zod';

const taskShape = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{24}$/),
  title: z.string().min(1),
  status: z.enum(['pending', 'completed']),
  createdAt: z.iso.datetime(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  priority: z.enum(['low', 'medium', 'high']),
});

/** Response contract for GET /api/tasks (EP-TASK-01): strict, so any extra field (ownerId, updatedAt) fails. */
export const listTasksSuccessSchema = z.strictObject({
  tasks: z.array(taskShape),
  overdueCount: z.number().int().nonnegative().optional(),
});

/** 400 contract for GET /api/tasks (EP-TASK-01): `fields` names only the refused query keys, with their shared messages. */
export const searchValidationSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal('VALIDATION'),
    message: z.literal('Validation failed'),
    fields: z.strictObject({
      search: z.enum([
        'Search text must be a single value.',
        'Search text can be at most 100 characters.',
      ]),
    }),
  }),
});

export const listFilterValidationSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal('VALIDATION'),
    message: z.literal('Validation failed'),
    fields: z.partialRecord(
      z.enum(['status', 'priority', 'due', 'sort', 'today']),
      z.enum([
        'Status must be pending or completed',
        'Priority must be low, medium or high.',
        'Status must be a single value.',
        'Priority must be a single value.',
        'Due filter must be a single value.',
        'Sort must be a single value.',
        'Today must be a single value.',
        'Due filter must be overdue, today, week or none.',
        'Sort must be newest, due or priority.',
        'Today must be a real date in YYYY-MM-DD form.',
        "Send today's date with this due filter.",
      ]),
    ),
  }),
});

const dueDateMessages = [
  'Due date must be a real date in YYYY-MM-DD form.',
  'Due date can be at most 5 years ahead.',
] as const;

/** Response contract for POST /api/tasks (EP-TASK-02): a new task is always pending. */
export const createTaskSuccessSchema = z.strictObject({
  task: taskShape.extend({ status: z.literal('pending') }),
});

export const createTaskValidationSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal('VALIDATION'),
    message: z.string().min(1),
    fields: z.partialRecord(
      z.enum(['title', 'dueDate', 'priority']),
      z.enum([
        'Enter a title.',
        'Titles can be at most 200 characters.',
        ...dueDateMessages,
        'Priority must be low, medium or high.',
      ]),
    ),
  }),
});

/** Response contract for PATCH /api/tasks/:id (EP-TASK-03): the same task shape, either status. */
export const updateTaskSuccessSchema = z.strictObject({ task: taskShape });

export const updateTaskValidationSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal('VALIDATION'),
    message: z.string().min(1),
    fields: z.partialRecord(
      z.enum(['title', 'status', 'dueDate', 'priority', 'body']),
      z.enum([
        'Enter a title.',
        'Titles can be at most 200 characters.',
        'Status must be pending or completed',
        ...dueDateMessages,
        'Priority must be low, medium or high.',
        'Provide a title, status, due date or priority',
      ]),
    ),
  }),
});

export const notFoundSchema = z.strictObject({
  error: z.strictObject({ code: z.literal('NOT_FOUND'), message: z.literal('Task not found.') }),
});
