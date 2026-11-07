// tier: unit
// requires: nothing (models are replaced with in-memory stubs; no DB, no network)
import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readSessionId } from '../../src/auth/cookie.js';
import { createRequireSession } from '../../src/auth/requireSession.js';
import { hashSessionId } from '../../src/auth/sessions.js';
import { loginSchema } from '../../src/auth/validation.js';
import { ApiError } from '../../src/lib/apiError.js';
import { parseBody } from '../../src/lib/parseBody.js';
import { Session } from '../../src/models/Session.js';
import { User } from '../../src/models/User.js';
import { build } from '../support/builders.js';

const NOW = new Date('2026-03-01T10:00:00.000Z');
const userId = new Types.ObjectId();
const COOKIE_VALUE = 'a'.repeat(64);
const sessionRow = build({
  _id: hashSessionId(COOKIE_VALUE),
  userId,
  createdAt: NOW,
  expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
});

function stubLookups(session: object | null, user: object | null) {
  const findSession = vi
    .spyOn(Session, 'findById')
    .mockReturnValue({ lean: () => Promise.resolve(session) } as never);
  const deleteSession = vi.spyOn(Session, 'deleteOne').mockResolvedValue({} as never);
  vi.spyOn(User, 'findById').mockReturnValue({ lean: () => Promise.resolve(user) } as never);
  return { findSession, deleteSession };
}

async function run(cookie: string | undefined, clock: () => Date) {
  const req = { headers: { cookie } } as unknown as Request;
  const res = { locals: {} } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  let error: unknown;
  try {
    await createRequireSession({ clock })(req, res, next);
  } catch (err) {
    error = err;
  }
  return { res, next: next as unknown as ReturnType<typeof vi.fn>, error };
}

function expectUnauthenticated(error: unknown) {
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED', message: 'Not signed in.' });
}

describe('requireSession', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('attaches the user identity and continues for a live session (AC-1)', async () => {
    const { findSession } = stubLookups(sessionRow, { _id: userId, username: 'selvam' });
    const { res, next, error } = await run(`sid=${COOKIE_VALUE}`, () => NOW);
    expect(error).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
    expect(res.locals.user).toEqual({ id: userId.toString(), username: 'selvam' });
    expect(findSession).toHaveBeenCalledWith(hashSessionId(COOKIE_VALUE));
  });

  it('refuses when there is no cookie (AC-9)', async () => {
    const { findSession } = stubLookups(sessionRow, { _id: userId, username: 'selvam' });
    const { next, error } = await run(undefined, () => NOW);
    expectUnauthenticated(error);
    expect(next).not.toHaveBeenCalled();
    expect(findSession).not.toHaveBeenCalled();
  });

  it('refuses an unknown session (AC-9)', async () => {
    stubLookups(null, { _id: userId, username: 'selvam' });
    const { error } = await run(`sid=${COOKIE_VALUE}`, () => NOW);
    expectUnauthenticated(error);
  });

  it('looks the session up only by the hash, never by the raw cookie value', async () => {
    const { findSession } = stubLookups(null, null);
    await run(`sid=${COOKIE_VALUE}`, () => NOW);
    expect(findSession).not.toHaveBeenCalledWith(COOKIE_VALUE);
  });

  it('keeps a session valid one millisecond before expiry and ends it at expiry (AC-4, BR-3)', async () => {
    const expires = sessionRow.expiresAt.getTime();
    stubLookups(sessionRow, { _id: userId, username: 'selvam' });
    const before = await run(`sid=${COOKIE_VALUE}`, () => new Date(expires - 1));
    expect(before.error).toBeUndefined();
    const { deleteSession } = stubLookups(sessionRow, { _id: userId, username: 'selvam' });
    const at = await run(`sid=${COOKIE_VALUE}`, () => new Date(expires));
    expectUnauthenticated(at.error);
    expect(deleteSession).toHaveBeenCalledWith({ _id: sessionRow._id });
  });

  it('ends a session long after expiry and deletes the row (AC-4)', async () => {
    const { deleteSession } = stubLookups(sessionRow, { _id: userId, username: 'selvam' });
    const later = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000);
    const { error } = await run(`sid=${COOKIE_VALUE}`, () => later);
    expectUnauthenticated(error);
    expect(deleteSession).toHaveBeenCalledOnce();
  });

  it('never writes expiresAt, so activity does not extend a session (AC-11)', async () => {
    stubLookups(sessionRow, { _id: userId, username: 'selvam' });
    const update = vi.spyOn(Session, 'updateOne');
    const save = vi.spyOn(Session, 'findByIdAndUpdate');
    await run(`sid=${COOKIE_VALUE}`, () => NOW);
    expect(update).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses a session whose user no longer exists', async () => {
    stubLookups(sessionRow, null);
    const { next, error } = await run(`sid=${COOKIE_VALUE}`, () => NOW);
    expectUnauthenticated(error);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('loginSchema', () => {
  it('lower-cases the username without trimming it (BR-1)', () => {
    expect(parseBody(loginSchema, { username: 'Selvam', password: 'x' })).toEqual({
      username: 'selvam',
      password: 'x',
    });
    expect(parseBody(loginSchema, { username: ' Selvam ', password: 'x' }).username).toBe(
      ' selvam ',
    );
  });

  it.each([
    [{}],
    [{ username: '', password: 'x' }],
    [{ username: 'a', password: '' }],
    [{ username: 5, password: 'x' }],
    [{ username: 'a', password: null }],
  ])('refuses %j with the single missing-credentials message', (body) => {
    try {
      parseBody(loginSchema, body);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const fields = (err as ApiError).fields ?? {};
      expect((err as ApiError).code).toBe('VALIDATION');
      for (const message of Object.values(fields)) {
        expect(message).toBe('Enter a username and password.');
      }
    }
  });

  it('reads the session cookie among other cookies', () => {
    expect(readSessionId(`theme=dark; sid=${COOKIE_VALUE}`)).toBe(COOKIE_VALUE);
  });
});
