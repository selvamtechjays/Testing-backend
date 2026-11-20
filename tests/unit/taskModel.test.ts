// tier: unit
// requires: nothing (validate runs the schema rules in memory; no DB, no network)
import { Error, Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { TASK_FIELD_MESSAGES } from '../../src/lib/taskFields.js';
import { NOTES_MAX } from '../../src/lib/taskNotes.js';
import { Task } from '../../src/models/Task.js';

const NOW = new Date('2026-11-16T12:00:00.000Z');
const build = (dueDate?: string, notes?: string) =>
  new Task({
    ownerId: new Types.ObjectId(),
    title: 'pay rent',
    dueDate,
    notes,
    createdAt: NOW,
    updatedAt: NOW,
  });

describe('the task model due date rule (AC-4)', () => {
  it('refuses a due date that is not a real calendar day, naming dueDate', async () => {
    const error = await build('2026-02-30')
      .validate()
      .catch((err: Error.ValidationError) => err);
    expect(error).toBeInstanceOf(Error.ValidationError);
    expect(Object.keys((error as Error.ValidationError).errors)).toEqual(['dueDate']);
    expect((error as Error.ValidationError).errors.dueDate?.message).toBe(
      TASK_FIELD_MESSAGES.dueDateInvalid,
    );
  });

  it('accepts a real calendar day and a task with no due date', () => {
    expect(build('2026-11-20').validateSync()).toBeUndefined();
    expect(build().validateSync()).toBeUndefined();
  });
});

describe('the task model notes rule (AC-1, AC-3)', () => {
  it('accepts a task with no notes, and stores no default for the field', () => {
    const task = build();
    expect(task.validateSync()).toBeUndefined();
    expect(task.notes).toBeUndefined();
    expect(task.toObject()).not.toHaveProperty('notes');
  });

  it('accepts notes of exactly 1000 characters', () => {
    expect(build(undefined, 'x'.repeat(NOTES_MAX)).validateSync()).toBeUndefined();
  });

  it('refuses notes of 1001 characters, naming notes', () => {
    const error = build(undefined, 'x'.repeat(NOTES_MAX + 1)).validateSync();
    expect(Object.keys(error?.errors ?? {})).toEqual(['notes']);
  });
});

describe('the task model tag link (Task-25, AC-3)', () => {
  it('accepts a task with no tagIds, and stores no default for the field', () => {
    const task = build();
    expect(task.validateSync()).toBeUndefined();
    expect(task.tagIds).toBeUndefined();
    expect(task.toObject()).not.toHaveProperty('tagIds');
  });

  it('accepts a list of tag ids', () => {
    const task = new Task({
      ownerId: new Types.ObjectId(),
      title: 'pay rent',
      tagIds: [new Types.ObjectId(), new Types.ObjectId()],
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(task.validateSync()).toBeUndefined();
    expect(task.tagIds).toHaveLength(2);
  });

  it('declares the multikey index on the owner and the tag ids', () => {
    const index = Task.schema.indexes().find(([fields]) => 'tagIds' in fields);
    expect(index?.[0]).toEqual({ ownerId: 1, tagIds: 1 });
  });
});
