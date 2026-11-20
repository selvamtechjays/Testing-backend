// tier: unit
// requires: nothing (only the paths that never reach the database; no DB, no network)
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { requireOwnedTags, tagsForTasks } from '../../src/services/tags.js';

const OWNER = new Types.ObjectId().toString();

describe('tag lookups that need no database (Task-29, FEAT-TAG-03)', () => {
  it('treats an empty id list as nothing to check', async () => {
    await expect(requireOwnedTags(OWNER, [])).resolves.toBeUndefined();
  });

  it('answers an empty list for every row when no row carries a tag id (AC-4)', async () => {
    const rows = [{}, { tagIds: undefined }, { tagIds: [] }, { tagIds: null }];
    await expect(tagsForTasks(OWNER, rows)).resolves.toEqual([[], [], [], []]);
  });

  it('answers an empty result for no rows at all', async () => {
    await expect(tagsForTasks(OWNER, [])).resolves.toEqual([]);
  });
});
