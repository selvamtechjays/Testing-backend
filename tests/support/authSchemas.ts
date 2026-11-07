import { z } from 'zod';

/** Response contract for POST /api/auth/register (EP-AUTH-01): strict, so any extra field fails. */
export const registerSuccessSchema = z.strictObject({
  user: z.strictObject({
    id: z.string().regex(/^[0-9a-f]{24}$/),
    username: z.string().regex(/^[a-z0-9_]{3,30}$/),
  }),
});

export const registerValidationSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal('VALIDATION'),
    message: z.string().min(1),
    fields: z.partialRecord(z.enum(['username', 'password']), z.string().min(1)),
  }),
});

export const registerTakenSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal('USERNAME_TAKEN'),
    message: z.literal('That username is already taken. Choose another.'),
    fields: z.strictObject({
      username: z.literal('That username is already taken. Choose another.'),
    }),
  }),
});

export const registerRequest = { username: 'Priya_B', password: 'correct horse battery' };

/** Response contract for POST /api/auth/login and GET /api/auth/me (EP-AUTH-02, EP-AUTH-04). */
export const loginSuccessSchema = z.strictObject({
  user: z.strictObject({
    id: z.string().regex(/^[0-9a-f]{24}$/),
    username: z.string().min(1),
  }),
});

export const invalidCredentialsSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal('INVALID_CREDENTIALS'),
    message: z.literal('Incorrect username or password.'),
  }),
});

export const unauthenticatedSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal('UNAUTHENTICATED'),
    message: z.literal('Not signed in.'),
  }),
});

export const loginValidationSchema = z.strictObject({
  error: z.strictObject({
    code: z.literal('VALIDATION'),
    message: z.string().min(1),
    fields: z.partialRecord(
      z.enum(['username', 'password']),
      z.literal('Enter a username and password.'),
    ),
  }),
});
