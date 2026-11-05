import type { ZodType } from 'zod';
import { expect } from 'vitest';

/** Asserts a response body matches a zod schema; failure message lists the schema issues. */
export function expectMatchesSchema<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
  return result.data as T;
}
