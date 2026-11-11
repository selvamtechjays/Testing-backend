import { Router } from 'express';
import { z } from 'zod';
import { createRequireSession } from '../auth/requireSession.js';
import { MESSAGES } from '../auth/validation.js';
import { ApiError } from '../lib/apiError.js';
import { asRecord } from '../lib/asRecord.js';
import { parseBody } from '../lib/parseBody.js';
import { TASK_ID_PATTERN, TASK_NOT_FOUND } from '../lib/taskId.js';
import { taskTitleSchema } from '../lib/taskTitle.js';
import { updateTaskSchema } from '../lib/taskUpdate.js';
import { createTask, deleteTask, listTasks, updateTask } from '../services/tasks.js';

export interface TasksDeps {
  clock: () => Date;
}

// Unknown body fields (status, ownerId, notes, ...) are stripped, never stored and never an error.
const createTaskSchema = z.object({ title: taskTitleSchema });

/** The id of the signed-in user, set by the session guard on every request that reaches a handler. */
function ownerOf(user: { id: string } | undefined): string {
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', MESSAGES.notSignedIn);
  return user.id;
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
  router.get('/tasks', requireSession, async (_req, res) => {
    const tasks = await listTasks(ownerOf(res.locals.user));
    res.status(200).json({ tasks });
  });
  router.post('/tasks', requireSession, async (req, res) => {
    const input = parseBody(createTaskSchema, asRecord(req.body));
    const task = await createTask(ownerOf(res.locals.user), input.title, deps.clock());
    res.status(201).json({ task });
  });
  router.patch('/tasks/:id', requireSession, async (req, res) => {
    const taskId = taskIdOf(req.params.id);
    const input = parseBody(updateTaskSchema, asRecord(req.body));
    const task = await updateTask(ownerOf(res.locals.user), taskId, input, deps.clock());
    res.status(200).json({ task });
  });
  router.delete('/tasks/:id', requireSession, async (req, res) => {
    await deleteTask(ownerOf(res.locals.user), taskIdOf(req.params.id));
    res.status(204).end();
  });
  return router;
}
