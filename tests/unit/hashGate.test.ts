// tier: unit
// requires: nothing (the gate is driven with controllable tasks, no real hashing)
import { describe, expect, it } from 'vitest';
import {
  HASH_MAX_CONCURRENT,
  HASH_MAX_QUEUED,
  HASH_RETRY_AFTER_SECONDS,
  createHashGate,
} from '../../src/auth/hashGate.js';
import { ApiError } from '../../src/lib/apiError.js';

/** A task that stays running until `finish()` and records the order and peak of concurrent runs. */
function createProbe() {
  let running = 0;
  const state = { peak: 0, started: [] as number[] };
  const finishers: Array<() => void> = [];
  const task = (id: number) => () => {
    running += 1;
    state.peak = Math.max(state.peak, running);
    state.started.push(id);
    return new Promise<number>((resolve) => {
      finishers.push(() => {
        running -= 1;
        resolve(id);
      });
    });
  };
  return { state, task, finishNext: () => finishers.shift()?.(), running: () => running };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('hash gate constants (DEC-304)', () => {
  it('allows 2 at once, queues 8 and asks refused callers to retry in 5 seconds', () => {
    expect([HASH_MAX_CONCURRENT, HASH_MAX_QUEUED, HASH_RETRY_AFTER_SECONDS]).toEqual([2, 8, 5]);
  });
});

describe('hash gate (AC-3)', () => {
  it('never runs more than 2 tasks at once', async () => {
    const gate = createHashGate();
    const probe = createProbe();
    const all = Array.from({ length: 6 }, (_, i) => gate.run(probe.task(i)));
    await tick();
    expect(probe.running()).toBe(2);
    for (let i = 0; i < 6; i += 1) {
      probe.finishNext();
      await tick();
    }
    await Promise.all(all);
    expect(probe.state.peak).toBe(2);
  });

  it('starts waiting tasks in arrival order', async () => {
    const gate = createHashGate();
    const probe = createProbe();
    const all = Array.from({ length: 5 }, (_, i) => gate.run(probe.task(i)));
    for (let i = 0; i < 5; i += 1) {
      await tick();
      probe.finishNext();
    }
    await Promise.all(all);
    expect(probe.state.started).toEqual([0, 1, 2, 3, 4]);
  });

  it('queues 8 behind the 2 running and refuses the 11th caller with 503 and Retry-After 5', async () => {
    const gate = createHashGate();
    const probe = createProbe();
    const admitted = Array.from({ length: 10 }, (_, i) => gate.run(probe.task(i)));
    const refused = await gate.run(probe.task(10)).catch((err: unknown) => err);
    expect(refused).toBeInstanceOf(ApiError);
    const err = refused as ApiError;
    expect([err.status, err.code, err.retryAfterSeconds]).toEqual([503, 'SERVICE_UNAVAILABLE', 5]);
    expect(probe.state.started).toEqual([0, 1]);
    for (let i = 0; i < 10; i += 1) {
      await tick();
      probe.finishNext();
    }
    await Promise.all(admitted);
    expect(probe.state.started).toHaveLength(10);
  });

  it('frees the slot when a task fails, so the queue keeps moving', async () => {
    const gate = createHashGate({ maxConcurrent: 1, maxQueued: 1 });
    const failing = gate.run(() => Promise.reject(new Error('derive failed')));
    const next = gate.run(() => Promise.resolve('ok'));
    await expect(failing).rejects.toThrow('derive failed');
    await expect(next).resolves.toBe('ok');
    await expect(gate.run(() => Promise.resolve('again'))).resolves.toBe('again');
  });

  it('accepts a smaller cap and queue through its options', async () => {
    const gate = createHashGate({ maxConcurrent: 1, maxQueued: 0 });
    const probe = createProbe();
    const first = gate.run(probe.task(1));
    await expect(gate.run(probe.task(2))).rejects.toMatchObject({ status: 503 });
    probe.finishNext();
    await first;
  });
});
