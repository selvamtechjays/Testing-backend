import { Types } from 'mongoose';
import { ApiError } from '../lib/apiError.js';
import { TAG_NOT_FOUND } from '../lib/tagId.js';
import { TAG_IDS_MESSAGES } from '../lib/tagIds.js';
import {
  DEFAULT_COLOUR,
  TAG_LIMIT,
  TAG_MESSAGES,
  type NewTagInput,
  type TagChanges,
  type TagColour,
} from '../lib/tagFields.js';
import { NAME_COLLATION, Tag } from '../models/Tag.js';
import { Task } from '../models/Task.js';

export interface TagDto {
  id: string;
  name: string;
  colour: TagColour;
  taskCount: number;
}

/** A tag row as the database returns it, with or without model defaults. */
interface TagRow {
  _id: Types.ObjectId;
  name: string;
  colour: TagColour;
}

/** The wire shape of one tag: no owner, no slot, no internal fields. `taskCount` is worked out per request. */
export function toTagDto(row: TagRow, taskCount: number): TagDto {
  return { id: row._id.toString(), name: row.name, colour: row.colour, taskCount };
}

/** A refusal naming `name`, in the same envelope every validation failure uses. */
function nameRefusal(message: string): ApiError {
  return new ApiError(400, 'VALIDATION', 'Validation failed', { name: message });
}

/** How many of the owner's tasks carry each tag, in one aggregation; a tag no task carries is absent. */
async function countTasksByTag(ownerId: Types.ObjectId): Promise<Map<string, number>> {
  const groups = await Task.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { ownerId, tagIds: { $exists: true } } },
    { $unwind: '$tagIds' },
    { $group: { _id: '$tagIds', count: { $sum: 1 } } },
  ]);
  return new Map(groups.map((group) => [group._id.toString(), group.count]));
}

/**
 * The signed-in owner's tags, sorted by name ignoring case (ties by id), each with how many of the owner's own
 * tasks carry it. The count is computed on every call and never stored (BR-6).
 */
export async function listTags(ownerId: string): Promise<{ tags: TagDto[] }> {
  const owner = new Types.ObjectId(ownerId);
  const [rows, counts] = await Promise.all([
    Tag.find({ ownerId: owner }).collation(NAME_COLLATION).sort({ name: 1, _id: 1 }).lean(),
    countTasksByTag(owner),
  ]);
  return { tags: rows.map((row) => toTagDto(row, counts.get(row._id.toString()) ?? 0)) };
}

/** The shape of Mongo's duplicate-key failure, which names the index that refused the write. */
interface DuplicateKeyError {
  code: number;
  keyPattern?: Record<string, unknown>;
}

const DUPLICATE_KEY_CODE = 11000;

function isDuplicateKey(error: unknown): error is DuplicateKeyError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as DuplicateKeyError).code === DUPLICATE_KEY_CODE
  );
}

/**
 * Every failed slot attempt means another create took a slot, so the owner's 50 slots bound the attempts.
 * Running out while a slot is still free is a busy refusal the client can retry, never the limit message.
 */
const MAX_SLOT_ATTEMPTS = TAG_LIMIT;

/** The smallest slot the owner does not hold, or `undefined` when all 50 are taken. */
async function smallestFreeSlot(ownerId: Types.ObjectId): Promise<number | undefined> {
  const used = new Set((await Tag.find({ ownerId }, { slot: 1 }).lean()).map((row) => row.slot));
  for (let slot = 0; slot < TAG_LIMIT; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return undefined;
}

/**
 * Creates a tag in the smallest free slot. The unique name index and the unique slot index decide races, not
 * the checks before them: a name clash is the duplicate refusal, and a slot clash means another create took the
 * slot, so the free slots are read again and the insert retried. The limit refusal is for "no free slot" only;
 * retries used up with a slot still free is a retryable 503. Any other failure, including a duplicate-key error
 * that names no index, is rethrown. The owner and the slot are never taken from the request.
 */
export async function createTag(ownerId: string, input: NewTagInput, now: Date): Promise<TagDto> {
  const owner = new Types.ObjectId(ownerId);
  for (let attempt = 0; attempt < MAX_SLOT_ATTEMPTS; attempt += 1) {
    const slot = await smallestFreeSlot(owner);
    if (slot === undefined) throw nameRefusal(TAG_MESSAGES.limitReached);
    try {
      const created = await Tag.create({
        ownerId: owner,
        name: input.name,
        colour: input.colour ?? DEFAULT_COLOUR,
        slot,
        createdAt: now,
        updatedAt: now,
      });
      return toTagDto(created, 0);
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const pattern = error.keyPattern;
      if (pattern && 'name' in pattern) throw nameRefusal(TAG_MESSAGES.nameTaken);
      if (!pattern || !('slot' in pattern)) throw error;
    }
  }
  throw new ApiError(503, 'SERVICE_UNAVAILABLE', TAG_MESSAGES.busy);
}

/** How many of the owner's own tasks carry the tag, counted when asked and never stored (BR-6). */
function countTasksWithTag(owner: Types.ObjectId, tagId: Types.ObjectId): Promise<number> {
  return Task.countDocuments({ ownerId: owner, tagIds: tagId });
}

/** The refusal for a tag that is missing, malformed or another user's: all three read the same (BR-10). */
function tagNotFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', TAG_NOT_FOUND);
}

/**
 * Renames and/or recolours the owner's tag in one atomic write filtered by id AND owner, so another user's tag is
 * indistinguishable from a missing one (404). Only the given fields and `updatedAt` are written; the owner and the
 * slot never are. The unique name index decides duplicates, and it does not count the tag against itself, so a
 * change of only the case of its own name succeeds. A change that alters nothing succeeds. Returns the tag with a
 * fresh task count.
 */
export async function updateTag(
  ownerId: string,
  tagId: string,
  changes: TagChanges,
  now: Date,
): Promise<TagDto> {
  const owner = new Types.ObjectId(ownerId);
  const id = new Types.ObjectId(tagId);
  try {
    const updated = await Tag.findOneAndUpdate(
      { _id: id, ownerId: owner },
      { $set: { ...changes, updatedAt: now } },
      { returnDocument: 'after', runValidators: true, collation: NAME_COLLATION },
    ).lean();
    if (!updated) throw tagNotFound();
    return toTagDto(updated, await countTasksWithTag(owner, id));
  } catch (error) {
    if (isDuplicateKey(error)) throw nameRefusal(TAG_MESSAGES.nameTaken);
    throw error;
  }
}

/** Removes the tag id from every task of the owner that carries it. */
function pullTagFromTasks(owner: Types.ObjectId, id: Types.ObjectId, now: Date) {
  return Task.updateMany(
    { ownerId: owner, tagIds: id },
    { $pull: { tagIds: id }, $set: { updatedAt: now } },
  );
}

/**
 * Deletes the owner's tag. Ownership is checked first, so a missing, malformed or another user's tag is the same
 * 404 and touches no task. The tag id is then pulled from the owner's tasks, the tag is deleted in one write
 * filtered by id AND owner, and the pull runs once more: a task write that passed its tag check just before the
 * delete can land after the first pull, and the sweep removes the id it left. Without transactions the window is
 * not zero, but a dangling id is skipped when tags are read (DEC-290). Tasks are never deleted and keep their
 * other tags; the deleted tag's slot is freed.
 */
export async function deleteTag(ownerId: string, tagId: string, now: Date): Promise<void> {
  const owner = new Types.ObjectId(ownerId);
  const id = new Types.ObjectId(tagId);
  if (!(await Tag.exists({ _id: id, ownerId: owner }))) throw tagNotFound();
  await pullTagFromTasks(owner, id, now);
  const result = await Tag.deleteOne({ _id: id, ownerId: owner });
  if (result.deletedCount === 0) throw tagNotFound();
  await pullTagFromTasks(owner, id, now);
}

/** Whether the tag exists and belongs to the owner; another user's tag and a missing one are the same `false`. */
export async function ownsTag(ownerId: string, tagId: string): Promise<boolean> {
  const found = await Tag.exists({
    _id: new Types.ObjectId(tagId),
    ownerId: new Types.ObjectId(ownerId),
  });
  return found !== null;
}

/** One tag as a task carries it: no count, no owner. */
export interface TaskTag {
  id: string;
  name: string;
  colour: TagColour;
}

const TAG_IDS_REFUSAL_FIELD = 'tagIds';

/**
 * Confirms every id is a tag of the owner, in one query. An unknown id and another user's id are the same
 * single refusal under `tagIds`, so the answer never says which it was (BR-3). Callers pass distinct ids.
 */
export async function requireOwnedTags(ownerId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await Tag.countDocuments({
    _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
    ownerId: new Types.ObjectId(ownerId),
  });
  if (found < ids.length) {
    throw new ApiError(400, 'VALIDATION', 'Validation failed', {
      [TAG_IDS_REFUSAL_FIELD]: TAG_IDS_MESSAGES.own,
    });
  }
}

/**
 * The tags of each row, in the order of `rows`, each list sorted by name ignoring case. One lookup scoped to
 * the owner serves the whole page; a missing `tagIds` is no tags, and an id with no tag row (the tag was deleted
 * after it was checked) is skipped.
 */
export async function tagsForTasks(
  ownerId: string,
  rows: { tagIds?: Types.ObjectId[] | null }[],
): Promise<TaskTag[][]> {
  const wanted = new Set(rows.flatMap((row) => (row.tagIds ?? []).map(String)));
  if (wanted.size === 0) return rows.map(() => []);
  const found = await Tag.find({
    _id: { $in: [...wanted].map((id) => new Types.ObjectId(id)) },
    ownerId: new Types.ObjectId(ownerId),
  })
    .collation(NAME_COLLATION)
    .sort({ name: 1, _id: 1 })
    .lean();
  const sorted: TaskTag[] = found.map((tag) => ({
    id: tag._id.toString(),
    name: tag.name,
    colour: tag.colour,
  }));
  return rows.map((row) => {
    const own = new Set((row.tagIds ?? []).map(String));
    return sorted.filter((tag) => own.has(tag.id));
  });
}
