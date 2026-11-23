import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { runWithRequestId } from '../lib/requestContext.js';

export const REQUEST_ID_HEADER = 'X-Request-Id';
// A client-supplied id is reused only when it is short and made of plain characters, so it is safe to put
// in a header and a log line (DEC-308).
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/** Picks the request id: the incoming header when it is well formed, otherwise a fresh UUID. */
export function resolveRequestId(incoming: string | undefined): string {
  return incoming !== undefined && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
}

/** First middleware: sets `X-Request-Id` on the response and runs the rest of the chain inside the request context. */
export function createRequestId(): RequestHandler {
  return (req, res, next) => {
    const requestId = resolveRequestId(req.get(REQUEST_ID_HEADER));
    res.setHeader(REQUEST_ID_HEADER, requestId);
    runWithRequestId(requestId, next);
  };
}
