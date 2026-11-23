import type { RequestHandler } from 'express';
import helmet from 'helmet';

export interface SecurityHeadersOptions {
  /** Send Strict-Transport-Security; only meaningful when the site is served over HTTPS (production). */
  hsts: boolean;
}

/**
 * The standard helmet header set on every response, `X-Powered-By` removed. No CORS headers are added: the
 * UI and the API share one origin (DEC-051, DEC-310).
 */
export function createSecurityHeaders(options: SecurityHeadersOptions): RequestHandler {
  return helmet({ strictTransportSecurity: options.hsts });
}
