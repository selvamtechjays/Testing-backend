// tier: unit
// requires: nothing (pure schema checks; no DB, no network)
import { describe, expect, it } from 'vitest';
import { parseBody } from '../../src/lib/parseBody.js';
import { ApiError } from '../../src/lib/apiError.js';
import { TITLE_MESSAGES } from '../../src/lib/taskTitle.js';
import { TASK_ID_PATTERN } from '../../src/lib/taskId.js';
import { UPDATE_MESSAGES, updateTaskSchema } from '../../src/lib/taskUpdate.js';

function refusedFields(body: unknown): Record<string, string> {
  try {
    parseBody(updateTaskSchema, body);
  } catch (err) {
    return (err as ApiError).fields ?? {};
  }
  throw new Error('expected the body to be refused');
}

describe('update body rule (FEAT-TASK-02, BR-1, BR-2, BR-3)', () => {
  it('accepts a status alone', () => {
    expect(parseBody(updateTaskSchema, { status: 'completed' })).toEqual({ status: 'completed' });
    expect(parseBody(updateTaskSchema, { status: 'pending' })).toEqual({ status: 'pending' });
  });

  it('accepts a title alone and trims it', () => {
    expect(parseBody(updateTaskSchema, { title: '  Buy oat milk ' })).toEqual({
      title: 'Buy oat milk',
    });
  });

  it('accepts a title and a status together', () => {
    expect(parseBody(updateTaskSchema, { title: 'x', status: 'completed' })).toEqual({
      title: 'x',
      status: 'completed',
    });
  });

  it('accepts a title of exactly 200 characters', () => {
    const title = 'x'.repeat(200);
    expect(parseBody(updateTaskSchema, { title })).toEqual({ title });
  });

  it('refuses a title of 201 characters with the too-long message', () => {
    expect(refusedFields({ title: 'x'.repeat(201) })).toEqual({ title: TITLE_MESSAGES.tooLong });
  });

  it('refuses an empty or whitespace-only title with the required message', () => {
    expect(refusedFields({ title: '' })).toEqual({ title: TITLE_MESSAGES.required });
    expect(refusedFields({ title: '   ' })).toEqual({ title: TITLE_MESSAGES.required });
  });

  it('refuses a status that is not pending or completed', () => {
    expect(refusedFields({ status: 'done' })).toEqual({ status: UPDATE_MESSAGES.status });
    expect(refusedFields({ status: 1 })).toEqual({ status: UPDATE_MESSAGES.status });
  });

  it('refuses a body with neither a title nor a status', () => {
    expect(refusedFields({})).toEqual({ body: UPDATE_MESSAGES.empty });
    expect(refusedFields({ notes: 'x' })).toEqual({ body: UPDATE_MESSAGES.empty });
  });

  it('strips ownerId, createdAt and other keys instead of passing them on', () => {
    const parsed = parseBody(updateTaskSchema, {
      status: 'completed',
      ownerId: 'abc',
      createdAt: '2000-01-01T00:00:00.000Z',
      notes: 'n',
    });
    expect(parsed).toEqual({ status: 'completed' });
  });
});

describe('task id shape', () => {
  it('accepts 24 hex characters only', () => {
    expect(TASK_ID_PATTERN.test('0123456789abcdef01234567')).toBe(true);
    expect(TASK_ID_PATTERN.test('0123456789ABCDEF01234567')).toBe(true);
    expect(TASK_ID_PATTERN.test('abcdefghijkl')).toBe(false);
    expect(TASK_ID_PATTERN.test('0123456789abcdef0123456')).toBe(false);
    expect(TASK_ID_PATTERN.test('0123456789abcdef012345678')).toBe(false);
    expect(TASK_ID_PATTERN.test('not-an-id')).toBe(false);
  });
});
