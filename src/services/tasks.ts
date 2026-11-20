import { Types, type PipelineStage } from 'mongoose';
import { ApiError } from '../lib/apiError.js';
import { addDaysCapped } from '../lib/calendarDate.js';
import { TASK_NOT_FOUND } from '../lib/taskId.js';
import { LIST_QUERY_MESSAGES, TAG_NONE, type ListQuery } from '../lib/taskSearch.js';
import type { TaskPriority } from '../lib/taskFields.js';
import { Task, type TaskStatus } from '../models/Task.js';
import { ownsTag, requireOwnedTags, tagsForTasks, type TaskTag } from './tags.js';

export interface TaskDto {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  dueDate: string | null;
  priority: TaskPriority;
  notes: string | null;
  /** The task's tags sorted by name ignoring case; `[]` for none, including every task written before tags existed. */
  tags: TaskTag[];
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
  notes?: string | null;
  tagIds?: Types.ObjectId[];
}

/**
 * The wire shape of one task: no owner, no internal fields (DEC-115). A missing due date is `null` and a
 * missing priority is `medium`, so a row written before these fields existed reads the same as a new default
 * one, with no backfill (DEC-210).
 */
export function toTaskDto(row: TaskRow, tags: TaskTag[]): TaskDto {
  return {
    id: row._id.toString(),
    title: row.title,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    dueDate: row.dueDate ?? null,
    priority: row.priority ?? 'medium',
    notes: row.notes ?? null,
    tags,
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

/** The extra match for the tag filter: one tag id, or `none` for a task with no tags, including a row with no field. */
function tagMatch(tag: string): Match {
  if (tag === TAG_NONE) {
    return { $or: [{ tagIds: { $exists: false } }, { tagIds: { $size: 0 } }] };
  }
  return { tagIds: new Types.ObjectId(tag) };
}

/**
 * The single match for a list: the owner filter comes first and is always applied (BR-6), then the optional
 * search, status, priority, due and tag filters, all combined. A stored task with no priority counts as medium, so
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
  if (query.tag) Object.assign(match, tagMatch(query.tag));
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
 * A tag id in the filter must be one of the caller's own tags. An unknown id and another user's id get the same
 * refusal as a malformed one, so the answer never says which tags exist (BR-3). `none` needs no check.
 */
async function requireOwnTagFilter(ownerId: string, tag: string | undefined): Promise<void> {
  if (tag === undefined || tag === TAG_NONE) return;
  if (await ownsTag(ownerId, tag)) return;
  throw new ApiError(400, 'VALIDATION', 'Validation failed', { tag: LIST_QUERY_MESSAGES.tag });
}

/**
 * The signed-in owner's tasks. Newest first by default (`_id` descending breaks ties between equal creation
 * times); `sort=due` puts the earliest date first with undated tasks last, and `sort=priority` puts high, then
 * medium, then low. Ties in either are newest first. When `today` is sent, `overdueCount` is the owner's pending
 * tasks due before it, counted over all of the owner's tasks whatever the filters, the tag and the search are
 * (DEC-212).
 */
export async function listTasks(ownerId: string, query: ListQuery): Promise<TaskList> {
  await requireOwnTagFilter(ownerId, query.tag);
  const [rows, overdueCount] = await Promise.all([
    findRows(buildMatch(ownerId, query), query.sort),
    query.today === undefined ? undefined : countOverdue(ownerId, query.today),
  ]);
  const tagLists = await tagsForTasks(ownerId, rows);
  const tasks = rows.map((row, index) => toTaskDto(row, tagLists[index] ?? []));
  return overdueCount === undefined ? { tasks } : { tasks, overdueCount };
}

export interface NewTask {
  title: string;
  /** `null` is the same as leaving it out: the task has no due date. */
  dueDate?: string | null;
  priority?: TaskPriority;
  /** `null` or empty is the same as leaving it out: the task has no notes. */
  notes?: string | null;
  /** Distinct ids of the owner's own tags; empty or absent means no tags. */
  tagIds?: string[];
}

/** Adds a pending task for the owner. Status and owner are never taken from the request body. */
export async function createTask(ownerId: string, input: NewTask, now: Date): Promise<TaskDto> {
  const tagIds = input.tagIds ?? [];
  await requireOwnedTags(ownerId, tagIds);
  const created = await Task.create({
    ownerId: new Types.ObjectId(ownerId),
    title: input.title,
    status: 'pending',
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    ...(tagIds.length > 0 ? { tagIds: tagIds.map((id) => new Types.ObjectId(id)) } : {}),
    createdAt: now,
    updatedAt: now,
  });
  const [tags] = await tagsForTasks(ownerId, [created]);
  return toTaskDto(created, tags ?? []);
}

export interface TaskChanges {
  title?: string;
  status?: TaskStatus;
  /** A date sets it; `null` removes it. */
  dueDate?: string | null;
  priority?: TaskPriority;
  /** A string sets it; `null` removes it. */
  notes?: string | null;
  /** The whole new list of the owner's own tag ids; `[]` removes every tag. Absent leaves the tags alone. */
  tagIds?: string[];
}

/**
 * Applies a title, status, due date, priority, notes and/or tags change in one atomic write filtered by id
 * AND owner, so another user's task is indistinguishable from a missing one (404). Only the given
 * fields and `updatedAt` (from the injected clock) are written; createdAt and ownerId never are. A
 * `null` due date or `null` notes is removed, not stored. Every tag id is checked to be the owner's own first,
 * so one bad id saves no field of the request.
 * Setting a field to its current value succeeds.
 */
export async function updateTask(
  ownerId: string,
  taskId: string,
  changes: TaskChanges,
  now: Date,
): Promise<TaskDto> {
  const { dueDate, notes, tagIds, ...rest } = changes;
  await requireOwnedTags(ownerId, tagIds ?? []);
  const set: Record<string, unknown> = { ...rest, updatedAt: now };
  // The whole list replaces the old one in this same write; `[]` is stored as `[]`, and an absent key writes nothing.
  if (tagIds) set.tagIds = tagIds.map((id) => new Types.ObjectId(id));
  const unset: Record<string, ''> = {};
  // A date or text sets the field; `null` removes it, so a cleared field is absent and never stored empty.
  for (const [field, value] of Object.entries({ dueDate, notes })) {
    if (typeof value === 'string') set[field] = value;
    else if (value === null) unset[field] = '';
  }
  const updated = await Task.findOneAndUpdate(
    { _id: new Types.ObjectId(taskId), ownerId: new Types.ObjectId(ownerId) },
    Object.keys(unset).length > 0 ? { $set: set, $unset: unset } : { $set: set },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!updated) throw new ApiError(404, 'NOT_FOUND', TASK_NOT_FOUND);
  const [tags] = await tagsForTasks(ownerId, [updated]);
  return toTaskDto(updated, tags ?? []);
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
