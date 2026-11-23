import { ApiError } from '../lib/apiError.js';

// At most this many password hashes run at once; each costs about 2 s and 32 MiB (DEC-304).
export const HASH_MAX_CONCURRENT = 2;
// This many more wait in arrival order; the next caller is refused instead of waiting.
export const HASH_MAX_QUEUED = 8;
export const HASH_RETRY_AFTER_SECONDS = 5;
const BUSY_MESSAGE = 'Service temporarily unavailable';

export interface HashGateOptions {
  maxConcurrent?: number;
  maxQueued?: number;
}

export interface HashGate {
  /** Runs `task` when a slot is free; waits in FIFO order behind a full gate; refuses with 503 once the queue is full. */
  run<T>(task: () => Promise<T>): Promise<T>;
}

/** Bounded semaphore for the expensive password hash, so a burst of sign-ins cannot starve the CPU. */
export function createHashGate(options: HashGateOptions = {}): HashGate {
  const maxConcurrent = options.maxConcurrent ?? HASH_MAX_CONCURRENT;
  const maxQueued = options.maxQueued ?? HASH_MAX_QUEUED;
  let active = 0;
  const waiting: Array<() => void> = [];

  function release(): void {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }

  function acquire(): Promise<void> {
    if (active < maxConcurrent) {
      active += 1;
      return Promise.resolve();
    }
    if (waiting.length >= maxQueued) {
      const busy = new ApiError(503, 'SERVICE_UNAVAILABLE', BUSY_MESSAGE);
      return Promise.reject(busy.withRetryAfter(HASH_RETRY_AFTER_SECONDS));
    }
    // The slot passes straight to the next waiter, so `active` stays put until the queue is empty.
    return new Promise<void>((resolve) => waiting.push(resolve));
  }

  return {
    async run(task) {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
