import { Types } from 'mongoose';
import { ApiError } from '../lib/apiError.js';
import { TASK_NOT_FOUND } from '../lib/taskId.js';
import { Task, type TaskStatus } from '../models/Task.js';

export interface TaskDto {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
}

interface TaskRow {
  _id: Types.ObjectId;
  title: string;
  status: TaskStatus;
  createdAt: Date;
}

/** The wire shape of one task: no owner, no internal fields (DEC-115). */
export function toTaskDto(row: TaskRow): TaskDto {
  return {
    id: row._id.toString(),
    title: row.title,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The signed-in owner's tasks, newest first; `_id` descending breaks ties between equal creation times. */
export async function listTasks(ownerId: string): Promise<TaskDto[]> {
  const rows = await Task.find({ ownerId: new Types.ObjectId(ownerId) })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  return rows.map(toTaskDto);
}

/** Adds a pending task for the owner. Status and owner are never taken from the request body. */
export async function createTask(ownerId: string, title: string, now: Date): Promise<TaskDto> {
  const created = await Task.create({
    ownerId: new Types.ObjectId(ownerId),
    title,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
  return toTaskDto(created);
}

/**
 * Applies a title and/or status change in one atomic write filtered by id AND owner, so another user's
 * task is indistinguishable from a missing one (404). Only the given fields and `updatedAt` (from the injected
 * clock) are written; createdAt and ownerId never are. Setting a status to its current value succeeds.
 */
export async function updateTask(
  ownerId: string,
  taskId: string,
  changes: { title?: string; status?: TaskStatus },
  now: Date,
): Promise<TaskDto> {
  const updated = await Task.findOneAndUpdate(
    { _id: new Types.ObjectId(taskId), ownerId: new Types.ObjectId(ownerId) },
    { $set: { ...changes, updatedAt: now } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!updated) throw new ApiError(404, 'NOT_FOUND', TASK_NOT_FOUND);
  return toTaskDto(updated);
}

/**
 * Hard-deletes the owner's task in one atomic write filtered by id AND owner: no read-then-delete race, and
 * another user's task is indistinguishable from a missing one (404). There is no trash and no restore.
 */
export async function deleteTask(ownerId: string, taskId: string): Promise<void> {
  const result = await Task.deleteOne({
    _id: new Types.ObjectId(taskId),
    ownerId: new Types.ObjectId(ownerId),
  });
  if (result.deletedCount === 0) throw new ApiError(404, 'NOT_FOUND', TASK_NOT_FOUND);
}
