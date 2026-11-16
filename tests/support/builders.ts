import { Types } from 'mongoose';
import type { TaskPriority } from '../../src/lib/taskFields.js';
import type { TaskStatus } from '../../src/models/Task.js';

/** Generic typed builder: returns a fresh object each call, so tests never share mutable fixtures. */
export function build<T extends object>(defaults: T, overrides: Partial<T> = {}): T {
  return { ...structuredClone(defaults), ...overrides };
}

/** A task row as the model stores it. `dueDate` is left out unless given, like a task added without one. */
export interface TaskRowOverrides {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  createdAt: Date;
}

const TASK_ROW_DEFAULTS = {
  title: 'A task',
  status: 'pending',
  priority: 'medium',
  createdAt: new Date('2026-03-01T09:00:00.000Z'),
} satisfies Partial<TaskRowOverrides>;

/** A fresh task row for the owner, ready for `Task.create`. `updatedAt` follows `createdAt`. */
export function buildTaskRow(ownerId: string, overrides: Partial<TaskRowOverrides> = {}) {
  const row = build<Partial<TaskRowOverrides>>(TASK_ROW_DEFAULTS, overrides);
  return { ...row, ownerId: new Types.ObjectId(ownerId), updatedAt: row.createdAt };
}
