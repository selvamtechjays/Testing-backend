// tier: unit
// requires: nothing (pure pattern)
import { describe, expect, it } from 'vitest';
import { TASK_ID_PATTERN } from '../../src/lib/taskId.js';

describe('task id rule', () => {
  it('accepts only 24 hex characters', () => {
    expect(TASK_ID_PATTERN.test('0123456789abcdef01234567')).toBe(true);
    expect(TASK_ID_PATTERN.test('0123456789abcdef0123456')).toBe(false);
  });
});
