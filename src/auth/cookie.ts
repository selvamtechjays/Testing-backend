export const SESSION_COOKIE_NAME = 'sid';

/** Set-Cookie value for a session: HttpOnly, SameSite=Lax, Path `/`, no Max-Age (ends with the browser session). */
export function buildSessionCookie(sessionId: string, options: { secure: boolean }): string {
  const parts = [`${SESSION_COOKIE_NAME}=${sessionId}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

/** Set-Cookie value that removes the session cookie in the browser. */
export function buildClearedSessionCookie(options: { secure: boolean }): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

/** Reads the session id from a Cookie request header, or undefined when absent or empty. */
export function readSessionId(cookieHeader: string | undefined): string | undefined {
  for (const pair of (cookieHeader ?? '').split(';')) {
    const separator = pair.indexOf('=');
    if (separator !== -1 && pair.slice(0, separator).trim() === SESSION_COOKIE_NAME) {
      return pair.slice(separator + 1).trim() || undefined;
    }
  }
  return undefined;
}
