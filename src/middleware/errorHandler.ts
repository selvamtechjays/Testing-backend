import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError } from '../lib/apiError.js';
import type { Logger } from '../lib/logger.js';
import { REQUEST_ID_HEADER } from './requestId.js';

/** Kept so scaffold callers still compile; new code uses ApiError. */
export { ApiError as HttpError };

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new ApiError(404, 'NOT_FOUND', 'Not found'));
};

const CONNECTIVITY_ERROR_NAMES = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongoTimeoutError',
  'MongooseServerSelectionError',
]);

function isConnectivityError(err: unknown): boolean {
  return err instanceof Error && CONNECTIVITY_ERROR_NAMES.has(err.name);
}

/** Maps non-ApiError errors that have a known meaning (body-parser, Mongo connectivity) to an ApiError. */
function toApiError(err: unknown): ApiError | undefined {
  if (err instanceof ApiError) return err;
  const type = (err as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed') {
    return new ApiError(400, 'BAD_REQUEST', 'Request body is not valid JSON');
  }
  if (type === 'entity.too.large') {
    return new ApiError(400, 'BAD_REQUEST', 'Request body is too large');
  }
  if (isConnectivityError(err)) {
    return new ApiError(503, 'SERVICE_UNAVAILABLE', 'Service temporarily unavailable');
  }
  return undefined;
}

/**
 * The one place errors become HTTP responses: `{ error: { code, message, fields? } }`. Internals never leak;
 * an unexpected error is logged with its stack and the request id instead.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const known = toApiError(err);
    if (known) {
      const error: { code: string; message: string; fields?: Record<string, string> } = {
        code: known.code,
        message: known.message,
      };
      if (known.fields) error.fields = known.fields;
      if (known.retryAfterSeconds !== undefined) {
        res.setHeader('Retry-After', String(known.retryAfterSeconds));
      }
      res.status(known.status).json({ error });
      return;
    }
    logger.error({ err, requestId: res.getHeader(REQUEST_ID_HEADER) }, 'Unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  };
}
