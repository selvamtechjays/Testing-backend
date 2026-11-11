// tier: integration
// requires: mongodb-memory-server (in-process, started by tests/integration/globalSetup.ts)
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../../src/models/Session.js';
import { Task } from '../../src/models/Task.js';
import { User } from '../../src/models/User.js';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';
import { SIGN_IN_TIME, signInAs, type TestUser } from '../support/signIn.js';
import {
  notFoundSchema,
  updateTaskSuccessSchema,
  updateTaskValidationSchema,
} from '../support/taskSchemas.js';

const NOW = new Date(SIGN_IN_TIME.getTime() + 60_000);
const app = () => createTestApp({ clock: () => NOW });
const T = (iso: string) => new Date(iso);

function patchAs(user: TestUser, id: string, body: unknown) {
  return request(app())
    .patch(`/api/tasks/${id}`)
    .set('Cookie', user.cookie)
    .send(body as object);
}

async function seedTask(
  owner: TestUser,
  title: string,
  createdAt: Date,
  status: 'pending' | 'completed' = 'pending',
) {
  return Task.create({
    ownerId: new mongoose.Types.ObjectId(owner.id),
    title,
    status,
    createdAt,
    updatedAt: createdAt,
  });
}

const stored = (id: string) => Task.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });

describe('edit and complete a task against a real database (FEAT-TASK-02)', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init(), Task.init()]);
  });

  it('ticks a pending task to completed and unticks it back (AC-1, AC-2, BR-3, TS-1, TS-2)', async () => {
    const user = await signInAs('priya');
    const task = await seedTask(user, 'Pay hosting invoice', T('2026-03-01T09:00:00.000Z'));
    const ticked = await patchAs(user, task.id, { status: 'completed' }).expect(200);
    expect(expectMatchesSchema(updateTaskSuccessSchema, ticked.body).task.status).toBe('completed');
    expect((await stored(task.id))?.status).toBe('completed');
    const unticked = await patchAs(user, task.id, { status: 'pending' }).expect(200);
    expect(unticked.body.task.status).toBe('pending');
    expect((await stored(task.id))?.status).toBe('pending');
  });

  it('succeeds when the status is already the one asked for (idempotent)', async () => {
    const user = await signInAs('priya');
    const task = await seedTask(user, 'Done already', T('2026-03-01T09:00:00.000Z'), 'completed');
    await patchAs(user, task.id, { status: 'completed' }).expect(200);
    const res = await patchAs(user, task.id, { status: 'completed' }).expect(200);
    expect(res.body.task.status).toBe('completed');
  });

  it('changes the title and keeps it after a fresh read (AC-3, BR-1, TS-3)', async () => {
    const user = await signInAs('priya');
    const task = await seedTask(user, 'Renew domain', T('2026-03-01T09:00:00.000Z'));
    const res = await patchAs(user, task.id, { title: 'Renew brightleaf domain' }).expect(200);
    expect(res.body.task.title).toBe('Renew brightleaf domain');
    const list = await request(app()).get('/api/tasks').set('Cookie', user.cookie).expect(200);
    expect(list.body.tasks[0].title).toBe('Renew brightleaf domain');
  });

  it('trims the new title before storing it', async () => {
    const user = await signInAs('priya');
    const task = await seedTask(user, 'Old', T('2026-03-01T09:00:00.000Z'));
    const res = await patchAs(user, task.id, { title: '   New title  ' }).expect(200);
    expect(res.body.task.title).toBe('New title');
  });

  it('accepts a 1-character and a 200-character title (AC-4, TS-4, TS-5)', async () => {
    const user = await signInAs('priya');
    const task = await seedTask(user, 'Old', T('2026-03-01T09:00:00.000Z'));
    await patchAs(user, task.id, { title: 'a' }).expect(200);
    const long = 'x'.repeat(200);
    const res = await patchAs(user, task.id, { title: long }).expect(200);
    expect(res.body.task.title).toBe(long);
    expect((await stored(task.id))?.title).toBe(long);
  });

  it('refuses a 201-character title and keeps the old one (AC-6, BR-2)', async () => {
    const user = await signInAs('priya');
    const task = await seedTask(user, 'Keep me', T('2026-03-01T09:00:00.000Z'));
    const res = await patchAs(user, task.id, { title: 'x'.repeat(201) }).expect(400);
    const body = expectMatchesSchema(updateTaskValidationSchema, res.body);
    expect(body.error.fields.title).toBe('Titles can be at most 200 characters.');
    expect((await stored(task.id))?.title).toBe('Keep me');
  });

  it('refuses an empty or whitespace-only title and keeps the old one (AC-5, BR-1, TS-7)', async () => {
    const user = await signInAs('priya');
    const task = await seedTask(user, 'Keep me', T('2026-03-01T09:00:00.000Z'));
    for (const title of ['', '   ']) {
      const res = await patchAs(user, task.id, { title }).expect(400);
      const body = expectMatchesSchema(updateTaskValidationSchema, res.body);
      expect(body.error.fields.title).toBe('Enter a title.');
    }
    expect((await stored(task.id))?.title).toBe('Keep me');
  });

  it('refuses an unknown status and an empty body and changes nothing', async () => {
    const user = await signInAs('priya');
    const task = await seedTask(user, 'Keep me', T('2026-03-01T09:00:00.000Z'));
    const badStatus = await patchAs(user, task.id, { status: 'done' }).expect(400);
    expect(
      expectMatchesSchema(updateTaskValidationSchema, badStatus.body).error.fields.status,
    ).toBe('Status must be pending or completed');
    const empty = await patchAs(user, task.id, {}).expect(400);
    expect(expectMatchesSchema(updateTaskValidationSchema, empty.body).error.fields.body).toBe(
      'Provide a title or a status',
    );
    const row = await stored(task.id);
    expect([row?.title, row?.status]).toEqual(['Keep me', 'pending']);
  });

  it('stamps updatedAt from the injected clock and leaves it out of the response', async () => {
    const user = await signInAs('priya');
    const created = T('2026-03-01T09:00:00.000Z');
    const task = await seedTask(user, 'Clocked', created);
    const res = await patchAs(user, task.id, { title: 'Clocked, edited' }).expect(200);
    expect(res.body.task).not.toHaveProperty('updatedAt');
    const row = await stored(task.id);
    expect(row?.updatedAt).toEqual(NOW);
    expect(row?.createdAt).toEqual(created);
  });

  // Pinned pending OQ-TASK-02 (no AC): revisit when the client answers.
  it('edits the title of a completed task and keeps it completed (OQ-TASK-02 behaviour)', async () => {
    const user = await signInAs('priya');
    const task = await seedTask(user, 'Done', T('2026-03-01T09:00:00.000Z'), 'completed');
    const res = await patchAs(user, task.id, { title: 'Done, renamed' }).expect(200);
    expect(res.body.task).toMatchObject({ title: 'Done, renamed', status: 'completed' });
  });

  it('never moves a task in the list on tick or edit, and keeps completed ones (AC-9, AC-10, BR-4, BR-6, TS-12, TS-13, TS-14)', async () => {
    const user = await signInAs('priya');
    const oldest = await seedTask(user, 'Oldest', T('2026-03-01T09:00:00.000Z'));
    const middle = await seedTask(user, 'Middle', T('2026-03-01T09:30:00.000Z'));
    const newest = await seedTask(user, 'Newest', T('2026-03-01T09:45:00.000Z'));
    await patchAs(user, oldest.id, { status: 'completed' }).expect(200);
    await patchAs(user, middle.id, { title: 'Middle, edited' }).expect(200);
    await patchAs(user, newest.id, { title: 'Newest, edited', status: 'completed' }).expect(200);
    const list = await request(app()).get('/api/tasks').set('Cookie', user.cookie).expect(200);
    expect(
      list.body.tasks.map((t: { title: string; status: string }) => [t.title, t.status]),
    ).toEqual([
      ['Newest, edited', 'completed'],
      ['Middle, edited', 'pending'],
      ['Oldest', 'completed'],
    ]);
  });

  it('never writes the owner or the creation time, whatever the body says (BR-6, R-1)', async () => {
    const caller = await signInAs('priya');
    const other = await signInAs('arjun');
    const createdAt = T('2026-03-01T09:00:00.000Z');
    const task = await seedTask(caller, 'Mine', createdAt);
    const res = await patchAs(caller, task.id, {
      status: 'completed',
      ownerId: other.id,
      createdAt: '2000-01-01T00:00:00.000Z',
    }).expect(200);
    expect(res.body.task.createdAt).toBe(createdAt.toISOString());
    const row = await stored(task.id);
    expect(row?.ownerId.toString()).toBe(caller.id);
    expect(row?.createdAt).toEqual(createdAt);
  });

  it('answers 404 for another user task and leaves it unchanged (AC-10, NFR data classification)', async () => {
    const owner = await signInAs('priya');
    const intruder = await signInAs('arjun');
    const task = await seedTask(owner, 'Private', T('2026-03-01T09:00:00.000Z'));
    const res = await patchAs(intruder, task.id, { title: 'Hijacked', status: 'completed' }).expect(
      404,
    );
    expect(expectMatchesSchema(notFoundSchema, res.body).error.message).toBe('Task not found.');
    const row = await stored(task.id);
    expect([row?.title, row?.status]).toEqual(['Private', 'pending']);
  });

  it('answers the same 404 for a missing id and a malformed id, before looking at the body', async () => {
    const user = await signInAs('priya');
    const missing = await patchAs(user, '0123456789abcdef01234567', { status: 'completed' }).expect(
      404,
    );
    const malformed = await patchAs(user, 'not-an-id', { status: 'completed' }).expect(404);
    const badBodyBadId = await patchAs(user, 'abcdefghijkl', { title: '' }).expect(404);
    for (const res of [missing, malformed, badBodyBadId]) {
      expect(expectMatchesSchema(notFoundSchema, res.body).error.message).toBe('Task not found.');
    }
  });

  it('round-trips emoji, accented and CJK characters and returns markup as plain text (TS-6, TS-11)', async () => {
    const user = await signInAs('priya');
    const task = await seedTask(user, 'Old', T('2026-03-01T09:00:00.000Z'));
    const text = 'Café 会議 🎉';
    await patchAs(user, task.id, { title: text }).expect(200);
    expect((await stored(task.id))?.title).toBe(text);
    const markup = '<script>alert(1)</script>';
    const res = await patchAs(user, task.id, { title: markup }).expect(200);
    expect(res.body.task.title).toBe(markup);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('refuses a caller with no session and changes nothing (AC-10)', async () => {
    const owner = await signInAs('priya');
    const task = await seedTask(owner, 'Private', T('2026-03-01T09:00:00.000Z'));
    await request(app()).patch(`/api/tasks/${task.id}`).send({ status: 'completed' }).expect(401);
    expect((await stored(task.id))?.status).toBe('pending');
  });
});
