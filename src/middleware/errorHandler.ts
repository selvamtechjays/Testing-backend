import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError } from '../lib/apiError.js';

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

/** The one place errors become HTTP responses: `{ error: { code, message, fields? } }`. Internals never leak. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
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
    res.status(known.status).json({ error });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
};
