// tier: unit
// requires: nothing (pure functions, no database)
import { describe, expect, it } from 'vitest';
import { isCommonPassword } from '../../src/auth/commonPasswords.js';
import { MESSAGES, registerSchema } from '../../src/auth/validation.js';
import { ApiError } from '../../src/lib/apiError.js';
import { parseBody } from '../../src/lib/parseBody.js';
import { build } from '../support/builders.js';

const validBody = { username: 'Priya_B', password: 'correct horse battery' };

function fieldsOf(body: unknown): Record<string, string> | undefined {
  try {
    parseBody(registerSchema, body);
  } catch (err) {
    return (err as ApiError).fields;
  }
  return undefined;
}

describe('register validation', () => {
  it('accepts a valid body and lower-cases the username (BR-1, BR-3)', () => {
    expect(parseBody(registerSchema, validBody)).toEqual({
      username: 'priya_b',
      password: 'correct horse battery',
    });
  });

  it.each([3, 30])('accepts a username of exactly %i characters (AC-3)', (length) => {
    const username = 'a'.repeat(length);
    expect(parseBody(registerSchema, build(validBody, { username })).username).toBe(username);
  });

  it('accepts an 8-character lower-case password that is not common (AC-4)', () => {
    expect(fieldsOf(build(validBody, { password: 'zebrafox' }))).toBeUndefined();
  });

  it('refuses a missing username and a missing password together (AC-5)', () => {
    expect(fieldsOf({})).toEqual({
      username: MESSAGES.usernameMissing,
      password: MESSAGES.passwordMissing,
    });
  });

  it('treats empty strings and non-string values as missing (AC-5)', () => {
    expect(fieldsOf({ username: '', password: 42 })).toEqual({
      username: MESSAGES.usernameMissing,
      password: MESSAGES.passwordMissing,
    });
  });

  it.each([2, 31])('refuses a username of %i characters with the length message (AC-6)', (n) => {
    const fields = fieldsOf(build(validBody, { username: 'a'.repeat(n) }));
    expect(fields).toEqual({ username: MESSAGES.usernameLength });
  });

  it.each(['has space', 'émile_b', 'bob😀', '<img src=x onerror=alert(1)>', 'dash-name'])(
    'refuses username %j with the characters message (AC-7)',
    (username) => {
      expect(fieldsOf(build(validBody, { username }))).toEqual({
        username: MESSAGES.usernameChars,
      });
    },
  );

  it('refuses a 7-character password with the length message (AC-8)', () => {
    expect(fieldsOf(build(validBody, { password: 'abcdefg' }))).toEqual({
      password: MESSAGES.passwordLength,
    });
  });

  it.each(['password', 'PASSWORD', 'Password123', '12345678', 'Qwerty123'])(
    'refuses the very common password %j (AC-9)',
    (password) => {
      expect(fieldsOf(build(validBody, { password }))).toEqual({
        password: MESSAGES.passwordCommon,
      });
    },
  );

  it('reports every failing field in one response (BR-4)', () => {
    expect(fieldsOf({ username: 'a!', password: 'x' })).toEqual({
      username: MESSAGES.usernameLength,
      password: MESSAGES.passwordLength,
    });
  });

  it('does not force a symbol or a capital letter (BR-2)', () => {
    expect(isCommonPassword('plainlowercasephrase')).toBe(false);
  });
});
