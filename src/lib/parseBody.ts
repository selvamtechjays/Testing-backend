import type { ZodType } from 'zod';
import { ApiError } from './apiError.js';

/** Validates an already-JSON-parsed body. Throws ApiError(400, VALIDATION) with one message per failing field. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.');
    if (!(key in fields)) fields[key] = issue.message;
  }
  throw new ApiError(400, 'VALIDATION', 'Validation failed', fields);
}
