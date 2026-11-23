/** Error codes shared by every feature (DEC-072). */
export type ApiErrorCode =
  | 'VALIDATION'
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'NOT_FOUND'
  | 'USERNAME_TAKEN'
  | 'SERVICE_UNAVAILABLE'
  | 'RATE_LIMITED'
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

  /** Whole seconds a client should wait before retrying; sent as the Retry-After header (DEC-305). */
  retryAfterSeconds?: number;

  /** Marks this error as retryable after `seconds`. */
  withRetryAfter(seconds: number): this {
    this.retryAfterSeconds = seconds;
    return this;
  }
}
