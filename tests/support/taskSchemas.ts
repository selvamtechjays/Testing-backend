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
  // Always present on the wire: text of 1 to 1000 characters, or null for a task with no notes (DEC-240).
  notes: z.string().min(1).max(1000).nullable(),
  // Always present on the wire, sorted by name; `[]` for a task with no tags, including every older task.
  tags: z.array(
    z.strictObject({
      id: z.string().regex(/^[0-9a-f]{24}$/),
      name: z.string().min(1).max(30),
      colour: z.enum(['gray', 'red', 'orange', 'green', 'blue', 'purple']),
    }),
  ),
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
      z.enum(['status', 'priority', 'due', 'sort', 'today', 'tag']),
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
        'Tag must be none or one of your own tags.',
        'Tag must be a single value.',
      ]),
    ),
  }),
});

const notesMessages = ['Notes must be text.', 'Notes can be at most 1000 characters.'] as const;

const tagIdsMessages = ['Tags must be your own tags.', 'A task can have up to 5 tags.'] as const;

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
      z.enum(['title', 'dueDate', 'priority', 'notes', 'tagIds']),
      z.enum([
        'Enter a title.',
        'Titles can be at most 200 characters.',
        ...dueDateMessages,
        'Priority must be low, medium or high.',
        ...notesMessages,
        ...tagIdsMessages,
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
      z.enum(['title', 'status', 'dueDate', 'priority', 'notes', 'tagIds', 'body']),
      z.enum([
        'Enter a title.',
        'Titles can be at most 200 characters.',
        'Status must be pending or completed',
        ...dueDateMessages,
        'Priority must be low, medium or high.',
        ...notesMessages,
        ...tagIdsMessages,
        'Provide a title, status, due date, priority, notes or tags',
      ]),
    ),
  }),
});

export const notFoundSchema = z.strictObject({
  error: z.strictObject({ code: z.literal('NOT_FOUND'), message: z.literal('Task not found.') }),
});

const tagShape = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{24}$/),
  name: z.string().min(1).max(30),
  colour: z.enum(['gray', 'red', 'orange', 'green', 'blue', 'purple']),
  taskCount: z.number().int().nonnegative(),
});

/** Response contract for GET /api/tags (EP-TAG-01): strict, so an owner or slot field fails. */
export const listTagsSuccessSchema = z.strictObject({ tags: z.array(tagShape) });

/** Response contract for POST /api/tags (EP-TAG-02): a new tag carries no tasks yet. */
export const createTagSuccessSchema = z.strictObject({
  tag: tagShape.extend({ taskCount: z.literal(0) }),
});

export const createTagValidationSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal('VALIDATION'),
    message: z.string().min(1),
    fields: z.partialRecord(
      z.enum(['name', 'colour']),
      z.enum([
        'Enter a tag name.',
        'Tag names can be at most 30 characters.',
        'Tag name must be text.',
        'You already have a tag with that name.',
        'You can have up to 50 tags.',
        'Colour must be gray, red, orange, green, blue or purple.',
      ]),
    ),
  }),
});

/** Response contract for PATCH /api/tags/:id (EP-TAG-03): the tag with a fresh count. */
export const updateTagSuccessSchema = z.strictObject({ tag: tagShape });

export const updateTagValidationSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal('VALIDATION'),
    message: z.string().min(1),
    fields: z.partialRecord(
      z.enum(['name', 'colour', 'body']),
      z.enum([
        'Enter a tag name.',
        'Tag names can be at most 30 characters.',
        'Tag name must be text.',
        'You already have a tag with that name.',
        'Colour must be gray, red, orange, green, blue or purple.',
        'Provide a name or a colour.',
      ]),
    ),
  }),
});

/** 404 for a tag that is missing, malformed or another user's: all three read the same (EP-TAG-03, EP-TAG-04). */
export const tagNotFoundSchema = z.strictObject({
  error: z.strictObject({ code: z.literal('NOT_FOUND'), message: z.literal('Tag not found.') }),
});
