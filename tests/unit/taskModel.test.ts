// tier: unit
// requires: nothing (validate runs the schema rules in memory; no DB, no network)
import { Error, Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { TASK_FIELD_MESSAGES } from '../../src/lib/taskFields.js';
import { Task } from '../../src/models/Task.js';

const NOW = new Date('2026-11-16T12:00:00.000Z');
const build = (dueDate?: string) =>
  new Task({
    ownerId: new Types.ObjectId(),
    title: 'pay rent',
    dueDate,
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
