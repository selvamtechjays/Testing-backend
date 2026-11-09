// tier: unit
// requires: nothing (constants)
import { describe, expect, it } from 'vitest';
import { TASK_ID_PATTERN, TASK_NOT_FOUND } from '../../src/lib/taskId.js';

describe('task id rule', () => {
  it('accepts only 24 hex characters', () => {
    expect(TASK_ID_PATTERN.test('0123456789abcdef01234567')).toBe(true);
    expect(TASK_ID_PATTERN.test('0123456789abcdef0123456')).toBe(false);
  });

  it('has one not-found message for missing, malformed and foreign tasks', () => {
    expect(TASK_NOT_FOUND).toBe('Task not found.');
  });
});
