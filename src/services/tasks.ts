import { Types, type PipelineStage } from 'mongoose';
import { ApiError } from '../lib/apiError.js';
import { addDaysCapped } from '../lib/calendarDate.js';
import { TASK_NOT_FOUND } from '../lib/taskId.js';
import { LIST_QUERY_MESSAGES, type ListQuery } from '../lib/taskSearch.js';
import type { TaskPriority } from '../lib/taskFields.js';
import { Task, type TaskStatus } from '../models/Task.js';

export interface TaskDto {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  dueDate: string | null;
  priority: TaskPriority;
}

/** The body of `GET /api/tasks`; `overdueCount` is present only when the caller sent `today` (DEC-212). */
export interface TaskList {
  tasks: TaskDto[];
  overdueCount?: number;
}

interface TaskRow {
  _id: Types.ObjectId;
  title: string;
  status: TaskStatus;
  createdAt: Date;
  // `.lean()` and aggregation skip the model defaults, so rows from before these fields existed lack them.
  dueDate?: string | null;
  priority?: TaskPriority;
}

/**
 * The wire shape of one task: no owner, no internal fields (DEC-115). A missing due date is `null` and a
 * missing priority is `medium`, so a row written before these fields existed reads the same as a new default
 * one, with no backfill (DEC-210).
 */
export function toTaskDto(row: TaskRow): TaskDto {
  return {
    id: row._id.toString(),
    title: row.title,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    dueDate: row.dueDate ?? null,
    priority: row.priority ?? 'medium',
  };
}

/** Escapes every regex metacharacter so user text is matched as a literal substring, never run as a pattern. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type Match = Record<string, unknown>;

/** A week is today and the six days after it. */
const WEEK_LAST_DAY_OFFSET = 6;

/** The one definition of overdue: still pending and due before the caller's today. */
function overdueMatch(today: string): Match {
  return { $and: [{ status: 'pending' }, { dueDate: { $lt: today } }] };
}

/** The last day the `week` filter covers, held at the last real date so it never leaves the date range. */
function weekEnd(today: string): string {
  return addDaysCapped(today, WEEK_LAST_DAY_OFFSET);
}

/**
 * The extra match for a due filter. The three date filters read the caller's `today`, never the server clock;
 * the query rule already refuses them without it, so the guard here is for direct callers.
 */
function dueMatch(due: NonNullable<ListQuery['due']>, today: string | undefined): Match {
  if (due === 'none') return { dueDate: null };
  if (today === undefined) {
    throw new ApiError(400, 'VALIDATION', 'Validation failed', {
      today: LIST_QUERY_MESSAGES.todayRequired,
    });
  }
  if (due === 'today') return { dueDate: today };
  if (due === 'week') return { dueDate: { $gte: today, $lte: weekEnd(today) } };
  return overdueMatch(today);
}

/**
 * The single match for a list: the owner filter comes first and is always applied (BR-6), then the optional
 * search, status, priority and due filters, all combined. A stored task with no priority counts as medium, so
 * `priority=medium` also matches a missing value (DEC-210).
 */
function buildMatch(ownerId: string, query: ListQuery): Match {
  const match: Match = { ownerId: new Types.ObjectId(ownerId) };
  if (query.search) match.title = { $regex: escapeRegExp(query.search), $options: 'i' };
  if (query.status) match.status = query.status;
  if (query.priority) {
    match.priority = query.priority === 'medium' ? { $in: ['medium', null] } : query.priority;
  }
  if (query.due) Object.assign(match, dueMatch(query.due, query.today));
  return match;
}

const NEWEST_FIRST = { createdAt: -1, _id: -1 } as const;

const NO_DUE_DATE_LAST: PipelineStage[] = [
  {
    $addFields: {
      noDueDate: { $cond: [{ $eq: [{ $ifNull: ['$dueDate', null] }, null] }, 1, 0] },
    },
  },
  { $sort: { noDueDate: 1, dueDate: 1, ...NEWEST_FIRST } },
];

const HIGH_MEDIUM_LOW: PipelineStage[] = [
  {
    $addFields: {
      priorityRank: {
        $switch: {
          branches: [
            { case: { $eq: ['$priority', 'high'] }, then: 0 },
            { case: { $eq: ['$priority', 'low'] }, then: 2 },
          ],
          // Medium and a missing priority both rank in the middle (DEC-210).
          default: 1,
        },
      },
    },
  },
  { $sort: { priorityRank: 1, ...NEWEST_FIRST } },
];

/**
 * Due date and priority sort through an aggregation with a computed key, because Mongo sorts a missing value
 * first and text alphabetically (DEC-216). The match is still the first stage, so the owner index narrows the
 * scan before anything is computed.
 */
async function findRows(match: Match, sort: ListQuery['sort']): Promise<TaskRow[]> {
  if (sort === 'due') return Task.aggregate<TaskRow>([{ $match: match }, ...NO_DUE_DATE_LAST]);
  if (sort === 'priority') return Task.aggregate<TaskRow>([{ $match: match }, ...HIGH_MEDIUM_LOW]);
  return Task.find(match).sort(NEWEST_FIRST).lean();
}

function countOverdue(ownerId: string, today: string): Promise<number> {
  return Task.countDocuments({
    ownerId: new Types.ObjectId(ownerId),
    ...overdueMatch(today),
  });
}

/**
 * The signed-in owner's tasks. Newest first by default (`_id` descending breaks ties between equal creation
 * times); `sort=due` puts the earliest date first with undated tasks last, and `sort=priority` puts high, then
 * medium, then low. Ties in either are newest first. When `today` is sent, `overdueCount` is the owner's pending
 * tasks due before it, counted over all of the owner's tasks whatever the filters and search are (DEC-212).
 */
export async function listTasks(ownerId: string, query: ListQuery): Promise<TaskList> {
  const [rows, overdueCount] = await Promise.all([
    findRows(buildMatch(ownerId, query), query.sort),
    query.today === undefined ? undefined : countOverdue(ownerId, query.today),
  ]);
  const tasks = rows.map(toTaskDto);
  return overdueCount === undefined ? { tasks } : { tasks, overdueCount };
}

export interface NewTask {
  title: string;
  /** `null` is the same as leaving it out: the task has no due date. */
  dueDate?: string | null;
  priority?: TaskPriority;
}

/** Adds a pending task for the owner. Status and owner are never taken from the request body. */
export async function createTask(ownerId: string, input: NewTask, now: Date): Promise<TaskDto> {
  const created = await Task.create({
    ownerId: new Types.ObjectId(ownerId),
    title: input.title,
    status: 'pending',
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    createdAt: now,
    updatedAt: now,
  });
  return toTaskDto(created);
}

export interface TaskChanges {
  title?: string;
  status?: TaskStatus;
  /** A date sets it; `null` removes it. */
  dueDate?: string | null;
  priority?: TaskPriority;
}

/**
 * Applies a title, status, due date and/or priority change in one atomic write filtered by id AND owner, so
 * another user's task is indistinguishable from a missing one (404). Only the given fields and `updatedAt` (from
 * the injected clock) are written; createdAt and ownerId never are. A `null` due date is removed, not stored.
 * Setting a field to its current value succeeds.
 */
export async function updateTask(
  ownerId: string,
  taskId: string,
  changes: TaskChanges,
  now: Date,
): Promise<TaskDto> {
  const { dueDate, ...rest } = changes;
  const set: Record<string, unknown> = { ...rest, updatedAt: now };
  if (typeof dueDate === 'string') set.dueDate = dueDate;
  const updated = await Task.findOneAndUpdate(
    { _id: new Types.ObjectId(taskId), ownerId: new Types.ObjectId(ownerId) },
    dueDate === null ? { $set: set, $unset: { dueDate: '' } } : { $set: set },
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
