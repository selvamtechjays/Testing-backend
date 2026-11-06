/** Error codes shared by every feature (DEC-072). */
export type ApiErrorCode =
  | 'VALIDATION'
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'NOT_FOUND'
  | 'USERNAME_TAKEN'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

/** Expected failure with a status, a stable code and a user-safe message. `fields` is for VALIDATION only. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
