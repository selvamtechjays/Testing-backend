// tier: unit
// requires: nothing (the Tag model is stubbed at its two database calls; no DB, no network)
import { Types } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/lib/apiError.js';
import { TAG_LIMIT, TAG_MESSAGES } from '../../src/lib/tagFields.js';
import { Tag } from '../../src/models/Tag.js';
import { createTag } from '../../src/services/tags.js';

const OWNER = new Types.ObjectId().toString();
const NOW = new Date('2026-11-20T10:00:00Z');

/** The owner holds `slots`; every read of the free slots answers with them. */
function stubSlots(slots: number[]) {
  const rows = slots.map((slot) => ({ slot }));
  vi.spyOn(Tag, 'find').mockReturnValue({ lean: () => Promise.resolve(rows) } as never);
}

const slotClash = () =>
  Object.assign(new Error('E11000'), { code: 11000, keyPattern: { slot: 1 } });

describe('creating a tag when slot clashes keep happening (Task-25, DEC-291)', () => {
  it('answers a retryable 503 with the busy message after the attempt bound, never the limit message', async () => {
    stubSlots([]);
    const create = vi.spyOn(Tag, 'create').mockRejectedValue(slotClash() as never);
    const error = await createTag(OWNER, { name: 'Work' }, NOW).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect((error as ApiError).message).toBe(TAG_MESSAGES.busy);
    expect(create).toHaveBeenCalledTimes(TAG_LIMIT);
  });

  it('rethrows a duplicate-key error that names neither the name nor the slot index', async () => {
    stubSlots([]);
    const odd = Object.assign(new Error('E11000'), { code: 11000 });
    vi.spyOn(Tag, 'create').mockRejectedValue(odd as never);
    await expect(createTag(OWNER, { name: 'Work' }, NOW)).rejects.toBe(odd);
  });

  it('answers the limit message when no slot is free', async () => {
    stubSlots(Array.from({ length: TAG_LIMIT }, (_, slot) => slot));
    const create = vi.spyOn(Tag, 'create');
    await expect(createTag(OWNER, { name: 'Work' }, NOW)).rejects.toMatchObject({
      status: 400,
      fields: { name: TAG_MESSAGES.limitReached },
    });
    expect(create).not.toHaveBeenCalled();
  });
});
