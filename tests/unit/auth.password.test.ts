// tier: unit
// requires: nothing (pure functions, no database)
import { describe, expect, it } from 'vitest';
import {
  buildClearedSessionCookie,
  buildSessionCookie,
  readSessionId,
} from '../../src/auth/cookie.js';
import { hashPassword, verifyPassword } from '../../src/auth/password.js';

describe('password hashing', () => {
  it('never stores the password in readable form (BR-4 data classification)', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).not.toContain('correct horse battery');
    expect(hash.startsWith('scrypt$32768$8$3$')).toBe(true);
  });

  it('uses a different salt for every hash of the same password', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);
    expect(a).not.toBe(b);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('right-password');
    expect(await verifyPassword('right-password', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it.each(['', 'plaintext', 'bcrypt$1$2$3$aa$bb', 'scrypt$x$y$z$zz$zz'])(
    'verifies malformed stored value %j as false',
    async (stored) => {
      expect(await verifyPassword('anything', stored)).toBe(false);
    },
  );
});

describe('session cookie helpers', () => {
  it('sets HttpOnly, SameSite=Lax, Path=/ and no Max-Age', () => {
    const cookie = buildSessionCookie('abc123', { secure: false });
    expect(cookie).toBe('sid=abc123; Path=/; HttpOnly; SameSite=Lax');
    expect(cookie).not.toMatch(/max-age|expires|secure/i);
  });

  it('adds Secure when asked (production)', () => {
    expect(buildSessionCookie('abc123', { secure: true })).toContain('; Secure');
  });

  it('builds a cookie that expires immediately when clearing', () => {
    const cookie = buildClearedSessionCookie({ secure: true });
    expect(cookie).toContain('sid=;');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('; Secure');
    expect(buildClearedSessionCookie({ secure: false })).not.toContain('Secure');
  });

  it('reads the session id from a Cookie header', () => {
    expect(readSessionId('theme=dark; sid=abc123; other=1')).toBe('abc123');
  });

  it.each([undefined, '', 'theme=dark', 'sid=', 'novalue'])(
    'returns undefined for Cookie header %j',
    (header) => {
      expect(readSessionId(header)).toBeUndefined();
    },
  );
});
