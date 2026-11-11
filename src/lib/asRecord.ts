/** The request body as a plain object; a missing, array or non-object body becomes `{}` so validation reports the fields. */
export function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}
