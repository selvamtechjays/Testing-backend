import { vi } from 'vitest';

/** Freezes the clock at the given ISO time. Restore with vi.useRealTimers() (afterEach in the test). */
export function useFakeClock(iso: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

/** Makes Math.random return the given values in order, repeating the last. restoreMocks undoes it. */
export function stubRandom(sequence: number[]): void {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(
    () => sequence[Math.min(i++, sequence.length - 1)] ?? 0,
  );
}
