import type { RequestHandler } from 'express';
import type { Logger } from '../lib/logger.js';
import { REQUEST_ID_HEADER } from './requestId.js';

/**
 * One line per finished response: method, path without the query string, status, duration and request id.
 * Bodies, headers and query strings are never logged (DEC-309).
 */
export function createAccessLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const startedAt = performance.now();
    res.on('finish', () => {
      logger.info(
        {
          requestId: res.getHeader(REQUEST_ID_HEADER),
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        },
        'request completed',
      );
    });
    next();
  };
}
