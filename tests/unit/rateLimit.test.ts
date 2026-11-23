// tier: unit
// requires: nothing (pure in-memory counter with an injected clock)
import { describe, expect, it } from 'vitest';
import { createFixedWindowCounter } from '../../src/middleware/rateLimit.js';

const WINDOW_MS = 60_000;

function setup(max = 3, maxKeys?: number) {
  let nowMs = 1_000_000;
  const counter = createFixedWindowCounter({ windowMs: WINDOW_MS, max, now: () => nowMs, maxKeys });
  return {
    counter,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe('fixed-window counter (AC-1, AC-2)', () => {
  it('counts hits per key and reports the limit once the max is reached', () => {
    const { counter } = setup(3);
    expect(counter.hit('a')).toMatchObject({ count: 1, limited: false });
    expect(counter.hit('a')).toMatchObject({ count: 2, limited: false });
    expect(counter.hit('a')).toMatchObject({ count: 3, limited: true });
    expect(counter.hit('b')).toMatchObject({ count: 1, limited: false });
  });

  it('starts a fresh window once the old one has ended', () => {
    const { counter, advance } = setup(1);
    counter.hit('a');
    expect(counter.peek('a').limited).toBe(true);
    advance(WINDOW_MS);
    expect(counter.peek('a')).toMatchObject({ count: 0, limited: false });
    expect(counter.hit('a').count).toBe(1);
  });

  it('reports the seconds left in the window, rounded up and never below one', () => {
    const { counter, advance } = setup(1);
    expect(counter.hit('a').retryAfterSeconds).toBe(60);
    advance(59_500);
    expect(counter.peek('a').retryAfterSeconds).toBe(1);
    advance(499);
    expect(counter.peek('a').retryAfterSeconds).toBe(1);
  });

  it('peek reads without counting and reset forgets the key', () => {
    const { counter } = setup(2);
    counter.hit('a');
    counter.peek('a');
    counter.peek('a');
    expect(counter.peek('a').count).toBe(1);
    counter.reset('a');
    expect(counter.peek('a').count).toBe(0);
  });

  it('stays bounded: at the key cap the oldest key makes room', () => {
    const { counter } = setup(5, 2);
    counter.hit('first');
    counter.hit('second');
    counter.hit('third');
    expect(counter.peek('first').count).toBe(0);
    expect(counter.peek('second').count).toBe(1);
    expect(counter.peek('third').count).toBe(1);
  });
});
