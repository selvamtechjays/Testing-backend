import { pino, stdTimeFunctions, type DestinationStream, type Logger } from 'pino';
import { currentRequestId } from './requestContext.js';

export type { Logger };

// Never written to a log whatever the call site passes (DEC-309). Wildcards cover one level each, so a
// header map nested under a request or response object is covered too.
// Plain keys take a dot, the hyphenated one needs bracket syntax.
const PLAIN_KEYS = ['password', 'passwordHash', 'authorization', 'cookie', 'sessionId'];
const REDACT_PATHS = [
  ...PLAIN_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
  '["set-cookie"]',
  '*["set-cookie"]',
  '*.*["set-cookie"]',
];
const CENSOR = '[Redacted]';

/** JSON-lines logger; every line carries the current request id. `destination` lets tests capture output. */
export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      timestamp: stdTimeFunctions.isoTime,
      redact: { paths: REDACT_PATHS, censor: CENSOR },
      mixin: () => {
        const requestId = currentRequestId();
        return requestId ? { requestId } : {};
      },
    },
    destination,
  );
}
