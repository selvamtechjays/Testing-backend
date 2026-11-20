import { Types } from 'mongoose';
import type { TagColour } from '../../src/lib/tagFields.js';
import type { TaskPriority } from '../../src/lib/taskFields.js';
import type { TaskStatus } from '../../src/models/Task.js';

/** Generic typed builder: returns a fresh object each call, so tests never share mutable fixtures. */
export function build<T extends object>(defaults: T, overrides: Partial<T> = {}): T {
  return { ...structuredClone(defaults), ...overrides };
}

/** A task row as the model stores it. `dueDate` and `notes` are left out unless given, like a task added without them. */
export interface TaskRowOverrides {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  notes: string;
  tagIds: Types.ObjectId[];
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

/** A tag row as the model stores it. `slot` must be unique per owner, so callers building several set it. */
export interface TagRowOverrides {
  name: string;
  colour: TagColour;
  slot: number;
  createdAt: Date;
}

const TAG_ROW_DEFAULTS = {
  name: 'A tag',
  colour: 'gray',
  slot: 0,
  createdAt: new Date('2026-03-01T09:00:00.000Z'),
} satisfies TagRowOverrides;

/** A fresh tag row for the owner, ready for `Tag.create`. `updatedAt` follows `createdAt`. */
export function buildTagRow(ownerId: string, overrides: Partial<TagRowOverrides> = {}) {
  const row = build<TagRowOverrides>(TAG_ROW_DEFAULTS, overrides);
  return { ...row, ownerId: new Types.ObjectId(ownerId), updatedAt: row.createdAt };
}

/** `count` tags for the owner named `tag-0`, `tag-1`, ... in slots 0 to count - 1, to fill or near-fill the library. */
export function buildTagRows(ownerId: string, count: number) {
  return Array.from({ length: count }, (_, slot) =>
    buildTagRow(ownerId, { name: `tag-${slot}`, slot }),
  );
}
