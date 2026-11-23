// tier: unit
// requires: nothing (validate runs the schema rules in memory; no DB, no network)
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { Tag } from '../../src/models/Tag.js';

const NOW = new Date('2026-11-20T12:00:00.000Z');
const build = (overrides: Record<string, unknown> = {}) =>
  new Tag({
    ownerId: new Types.ObjectId(),
    name: 'Work',
    slot: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });

describe('the tag model (Task-25, FEAT-TAG-01)', () => {
  it('defaults the colour to gray (AC-1, BR-4)', () => {
    const tag = build();
    expect(tag.validateSync()).toBeUndefined();
    expect(tag.colour).toBe('gray');
  });

  it('refuses a colour outside the six, naming colour (AC-10)', () => {
    const error = build({ colour: 'pink' }).validateSync();
    expect(Object.keys(error?.errors ?? {})).toEqual(['colour']);
  });

  it('accepts slots 0 and 49 and refuses 50, -1 and a fraction, naming slot (AC-11, BR-5)', () => {
    expect(build({ slot: 0 }).validateSync()).toBeUndefined();
    expect(build({ slot: 49 }).validateSync()).toBeUndefined();
    for (const slot of [50, -1, 1.5]) {
      expect(Object.keys(build({ slot }).validateSync()?.errors ?? {}), String(slot)).toEqual([
        'slot',
      ]);
    }
  });

  it('requires an owner, a name and a slot (BR-1)', () => {
    const error = new Tag({ createdAt: NOW, updatedAt: NOW }).validateSync();
    expect(Object.keys(error?.errors ?? {}).sort()).toEqual(['name', 'ownerId', 'slot']);
  });

  it('declares a unique name index that ignores case, and a unique slot index, both per owner (AC-7, AC-11, BR-2, BR-5)', () => {
    const indexes = Tag.schema.indexes();
    const byName = indexes.find(([fields]) => 'name' in fields);
    const bySlot = indexes.find(([fields]) => 'slot' in fields);
    expect(byName?.[0]).toEqual({ ownerId: 1, name: 1 });
    expect(byName?.[1]).toMatchObject({ unique: true, collation: { locale: 'en', strength: 2 } });
    expect(bySlot?.[0]).toEqual({ ownerId: 1, slot: 1 });
    expect(bySlot?.[1]).toMatchObject({ unique: true });
  });
});
