// tier: unit
// requires: nothing (pure schema checks; no DB, no network)
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../../src/lib/apiError.js';
import { parseBody } from '../../src/lib/parseBody.js';
import { TAG_IDS_MESSAGES, TASK_TAG_LIMIT, tagIdsSchema } from '../../src/lib/tagIds.js';

const bodySchema = z.object({ tagIds: tagIdsSchema });

/** A valid 24-hex tag id for a number. */
const id = (n: number) => n.toString(16).padStart(24, '0');

function refusedFields(body: unknown): Record<string, string> {
  try {
    parseBody(bodySchema, body);
  } catch (err) {
    return (err as ApiError).fields ?? {};
  }
  throw new Error('expected the body to be refused');
}

describe('task tag ids rule (Task-29, FEAT-TAG-03)', () => {
  it('allows at most 5 distinct tags per task (BR-2)', () => {
    expect(TASK_TAG_LIMIT).toBe(5);
  });

  it('accepts a body that leaves tagIds out, which means leave the tags alone (AC-2)', () => {
    expect(parseBody(bodySchema, {})).toEqual({});
    expect(parseBody(bodySchema, {}).tagIds).toBeUndefined();
  });

  it('accepts an empty list, which means no tags (AC-2, AC-10)', () => {
    expect(parseBody(bodySchema, { tagIds: [] })).toEqual({ tagIds: [] });
  });

  it('accepts two ids and keeps their order (AC-1)', () => {
    expect(parseBody(bodySchema, { tagIds: [id(2), id(1)] }).tagIds).toEqual([id(2), id(1)]);
  });

  it('counts ids that differ only by letter case as one, and returns them lower case (AC-3, BR-1)', () => {
    const upper = id(0xabcdef).toUpperCase();
    expect(parseBody(bodySchema, { tagIds: [id(0xabcdef), upper] }).tagIds).toEqual([id(0xabcdef)]);
  });

  it('accepts six ids that hold a repeat, because five are distinct (AC-3, BR-2)', () => {
    const ids = [id(1), id(2), id(3), id(4), id(5), id(1)];
    expect(parseBody(bodySchema, { tagIds: ids }).tagIds).toEqual([
      id(1),
      id(2),
      id(3),
      id(4),
      id(5),
    ]);
  });

  it('refuses a sixth distinct tag under tagIds with the limit message (AC-11, BR-2)', () => {
    const ids = [1, 2, 3, 4, 5, 6].map(id);
    expect(refusedFields({ tagIds: ids })).toEqual({ tagIds: TAG_IDS_MESSAGES.tooMany });
  });

  it('refuses a value that is not a list, with the same single message (AC-14, BR-3)', () => {
    for (const tagIds of ['abc', id(1), 5, null, { 0: id(1) }, true]) {
      expect(refusedFields({ tagIds }), String(tagIds)).toEqual({ tagIds: TAG_IDS_MESSAGES.own });
    }
  });

  it('refuses a non-string entry and a malformed id, with the same single message (AC-14, BR-3)', () => {
    const bad = [5, null, '', 'xyz', id(1).slice(1), id(1) + '0', 'g'.repeat(24), [id(1)]];
    for (const entry of bad) {
      expect(refusedFields({ tagIds: [id(2), entry] }), String(entry)).toEqual({
        tagIds: TAG_IDS_MESSAGES.own,
      });
    }
  });

  it('names tagIds for the whole list, never an entry position (AC-12, AC-14)', () => {
    expect(Object.keys(refusedFields({ tagIds: [id(1), 'bad'] }))).toEqual(['tagIds']);
  });
});
