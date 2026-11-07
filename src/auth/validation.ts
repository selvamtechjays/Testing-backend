import { z } from 'zod';
import { isCommonPassword } from './commonPasswords.js';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const PASSWORD_MIN = 8;

// Messages are shared verbatim with the UI (DEC-073).
export const MESSAGES = {
  usernameMissing: 'Enter a username.',
  passwordMissing: 'Enter a password.',
  usernameLength: 'Username must be 3 to 30 characters.',
  usernameChars: 'Username can only use letters, numbers and underscores.',
  passwordLength: 'Password must be at least 8 characters.',
  passwordCommon: 'That password is too common. Choose a stronger one.',
  usernameTaken: 'That username is already taken. Choose another.',
} as const;

// For each field the first failing check supplies the one message (parseBody keeps the first issue per field).
const username = z
  .string({ error: MESSAGES.usernameMissing })
  .min(1, MESSAGES.usernameMissing)
  .min(USERNAME_MIN, MESSAGES.usernameLength)
  .max(USERNAME_MAX, MESSAGES.usernameLength)
  .regex(/^[A-Za-z0-9_]+$/, MESSAGES.usernameChars)
  .transform((value) => value.toLowerCase());

const password = z
  .string({ error: MESSAGES.passwordMissing })
  .min(1, MESSAGES.passwordMissing)
  .min(PASSWORD_MIN, MESSAGES.passwordLength)
  .refine((value) => !isCommonPassword(value), MESSAGES.passwordCommon);

/** Register body: lower-cased username and a password that is long enough and not very common. */
export const registerSchema = z.object({ username, password });

export type RegisterInput = z.output<typeof registerSchema>;
