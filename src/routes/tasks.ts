import { Router } from 'express';
import { z } from 'zod';
import { createRequireSession } from '../auth/requireSession.js';
import { ApiError } from '../lib/apiError.js';
import { asRecord } from '../lib/asRecord.js';
import { ownerOf } from '../lib/ownerOf.js';
import { parseBody } from '../lib/parseBody.js';
import { TASK_ID_PATTERN, TASK_NOT_FOUND } from '../lib/taskId.js';
import { listQuerySchema } from '../lib/taskSearch.js';
import { dueDateSchema, prioritySchema } from '../lib/taskFields.js';
import { tagIdsSchema } from '../lib/tagIds.js';
import { notesSchema } from '../lib/taskNotes.js';
import { taskTitleSchema } from '../lib/taskTitle.js';
import { createUpdateTaskSchema } from '../lib/taskUpdate.js';
import { createTask, deleteTask, listTasks, updateTask } from '../services/tasks.js';

export interface TasksDeps {
  clock: () => Date;
}

// Unknown body fields (status, ownerId, ...) are stripped, never stored and never an error. A null due date or
// null/empty notes is the same as leaving it out. The clock is injected for the due-date limit.
function createTaskSchema(now: Date) {
  return z.object({
    title: taskTitleSchema,
    dueDate: dueDateSchema(now).nullable().optional(),
    priority: prioritySchema.optional(),
    notes: notesSchema,
    tagIds: tagIdsSchema,
  });
}

/** The `:id` path parameter. A malformed id is "not found", checked before any body so it cannot probe for valid ids. */
function taskIdOf(rawId: unknown): string {
  const taskId = String(rawId);
  if (!TASK_ID_PATTERN.test(taskId)) throw new ApiError(404, 'NOT_FOUND', TASK_NOT_FOUND);
  return taskId;
}

/** Task routes. Each sits behind the session guard and is scoped to the signed-in owner (BR-6). */
export function createTasksRouter(deps: TasksDeps): Router {
  const router = Router();
  const requireSession = createRequireSession({ clock: deps.clock });
  router.get('/tasks', requireSession, async (req, res) => {
    const query = parseBody(listQuerySchema, asRecord(req.query));
    res.status(200).json(await listTasks(ownerOf(res.locals.user), query));
  });
  router.post('/tasks', requireSession, async (req, res) => {
    const now = deps.clock();
    const input = parseBody(createTaskSchema(now), asRecord(req.body));
    const task = await createTask(ownerOf(res.locals.user), input, now);
    res.status(201).json({ task });
  });
  router.patch('/tasks/:id', requireSession, async (req, res) => {
    const taskId = taskIdOf(req.params.id);
    const now = deps.clock();
    const input = parseBody(createUpdateTaskSchema(now), asRecord(req.body));
    const task = await updateTask(ownerOf(res.locals.user), taskId, input, now);
    res.status(200).json({ task });
  });
  router.delete('/tasks/:id', requireSession, async (req, res) => {
    await deleteTask(ownerOf(res.locals.user), taskIdOf(req.params.id));
    res.status(204).end();
  });
  return router;
}
