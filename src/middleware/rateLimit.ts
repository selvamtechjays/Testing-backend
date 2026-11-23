const MAX_KEYS_DEFAULT = 10_000;

export interface FixedWindowOptions {
  windowMs: number;
  /** Hits allowed per key per window. */
  max: number;
  /** Time source in epoch milliseconds, injected so tests control the window. */
  now: () => number;
  /** Cap on distinct keys held; beyond it the oldest key is dropped. */
  maxKeys?: number;
}

export interface WindowState {
  /** Hits so far in the current window, including this one after `hit`. */
  count: number;
  /** True once `count` has reached `max`. */
  limited: boolean;
  /** Whole seconds until the window ends, at least 1. */
  retryAfterSeconds: number;
}

export interface FixedWindowCounter {
  /** Counts one hit against the key. */
  hit(key: string): WindowState;
  /** Reads the key without counting. */
  peek(key: string): WindowState;
  /** Forgets the key. */
  reset(key: string): void;
  /** The keys currently held, for tests that assert how callers key the counter. */
  keys(): string[];
}

interface Entry {
  count: number;
  resetAt: number;
}

/**
 * In-memory fixed-window counter keyed by string. State is per instance and lost on restart (DEC-307).
 * Memory is bounded: expired keys are dropped when seen and, at the cap, the oldest key makes room.
 */
export function createFixedWindowCounter(options: FixedWindowOptions): FixedWindowCounter {
  const { windowMs, max, now } = options;
  const maxKeys = options.maxKeys ?? MAX_KEYS_DEFAULT;
  const entries = new Map<string, Entry>();

  function liveEntry(key: string): Entry | undefined {
    const entry = entries.get(key);
    if (entry && entry.resetAt <= now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  function stateOf(entry: Entry | undefined): WindowState {
    const count = entry?.count ?? 0;
    const remainingMs = entry ? entry.resetAt - now() : windowMs;
    return {
      count,
      limited: count >= max,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
    };
  }

  function insert(key: string): Entry {
    if (entries.size >= maxKeys) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
    const entry = { count: 0, resetAt: now() + windowMs };
    entries.set(key, entry);
    return entry;
  }

  return {
    hit(key) {
      const entry = liveEntry(key) ?? insert(key);
      entry.count += 1;
      return stateOf(entry);
    },
    peek: (key) => stateOf(liveEntry(key)),
    reset: (key) => {
      entries.delete(key);
    },
    keys: () => [...entries.keys()],
  };
}
