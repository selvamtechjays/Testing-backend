// tier: integration
// requires: mongodb-memory-server (in-process, started by tests/integration/globalSetup.ts)
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../../src/models/Session.js';
import { Task } from '../../src/models/Task.js';
import { User } from '../../src/models/User.js';
import { buildTaskRow } from '../support/builders.js';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';
import { SIGN_IN_TIME, signInAs, type TestUser } from '../support/signIn.js';
import {
  createTaskSuccessSchema,
  createTaskValidationSchema,
  listTasksSuccessSchema,
  notFoundSchema,
  updateTaskSuccessSchema,
  updateTaskValidationSchema,
} from '../support/taskSchemas.js';

const NOW = new Date(SIGN_IN_TIME.getTime() + 60_000);
const app = () => createTestApp({ clock: () => NOW });

const listAs = (user: TestUser, query = '') =>
  request(app())
    .get('/api/tasks' + query)
    .set('Cookie', user.cookie);
const addAs = (user: TestUser, body: unknown) =>
  request(app())
    .post('/api/tasks')
    .set('Cookie', user.cookie)
    .send(body as object);
const patchAs = (user: TestUser, id: string, body: unknown) =>
  request(app())
    .patch('/api/tasks/' + id)
    .set('Cookie', user.cookie)
    .send(body as object);

const raw = (id: string) => Task.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });

async function seed(owner: TestUser, title: string, notes?: string) {
  return Task.create(buildTaskRow(owner.id, notes === undefined ? { title } : { title, notes }));
}

describe('task notes against a real database (Task-24)', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init(), Task.init()]);
  });

  describe('add and read (AC-1)', () => {
    it('returns exactly the notes it was given, and keeps them on the next read', async () => {
      const user = await signInAs('priya');
      const res = await addAs(user, { title: 'Buy paint', notes: 'Call Ravi 98400 12345' }).expect(
        201,
      );
      const { task } = expectMatchesSchema(createTaskSuccessSchema, res.body);
      expect(task.notes).toBe('Call Ravi 98400 12345');
      const list = await listAs(user).expect(200);
      expect(expectMatchesSchema(listTasksSuccessSchema, list.body).tasks[0]?.notes).toBe(
        'Call Ravi 98400 12345',
      );
      expect((await raw(task.id))?.notes).toBe('Call Ravi 98400 12345');
    });

    it('returns null and stores no field for a task added with no notes, null, empty or blank notes', async () => {
      const user = await signInAs('priya');
      for (const body of [
        { title: 'none' },
        { title: 'null', notes: null },
        { title: 'empty', notes: '' },
        { title: 'blank', notes: '  \n ' },
      ]) {
        const res = await addAs(user, body).expect(201);
        expect(res.body.task.notes, body.title).toBeNull();
        expect(await raw(res.body.task.id), body.title).not.toHaveProperty('notes');
      }
    });

    it('trims the notes and keeps inner newlines', async () => {
      const user = await signInAs('priya');
      const res = await addAs(user, { title: 't', notes: '  one\n\ntwo  ' }).expect(201);
      expect(res.body.task.notes).toBe('one\n\ntwo');
    });

    it('shows a row written before the field existed as notes null, with no backfill (DEC-240)', async () => {
      const user = await signInAs('priya');
      const legacy = await Task.collection.insertOne({
        ownerId: new mongoose.Types.ObjectId(user.id),
        title: 'Written before notes',
        status: 'pending',
        createdAt: new Date('2026-03-01T09:00:00.000Z'),
        updatedAt: new Date('2026-03-01T09:00:00.000Z'),
      });
      const res = await listAs(user).expect(200);
      const { tasks } = expectMatchesSchema(listTasksSuccessSchema, res.body);
      expect(tasks.map((t) => [t.title, t.notes])).toEqual([['Written before notes', null]]);
      expect(await raw(legacy.insertedId.toString())).not.toHaveProperty('notes');
    });

    it('carries notes on every list sort, including the aggregation paths', async () => {
      const user = await signInAs('priya');
      await seed(user, 'with', 'remember');
      await seed(user, 'without');
      for (const sort of ['newest', 'due', 'priority']) {
        const res = await listAs(user, '?sort=' + sort).expect(200);
        const byTitle = Object.fromEntries(
          expectMatchesSchema(listTasksSuccessSchema, res.body).tasks.map((t) => [
            t.title,
            t.notes,
          ]),
        );
        expect(byTitle, sort).toEqual({ with: 'remember', without: null });
      }
    });
  });

  describe('change and clear (AC-2)', () => {
    it('sets, changes and returns notes, leaving every other field alone', async () => {
      const user = await signInAs('priya');
      const task = await seed(user, 'Keep me');
      const set = await patchAs(user, task.id, { notes: 'first' }).expect(200);
      expect(expectMatchesSchema(updateTaskSuccessSchema, set.body).task.notes).toBe('first');
      const changed = await patchAs(user, task.id, { notes: 'second' }).expect(200);
      expect(changed.body.task.notes).toBe('second');
      const row = await raw(task.id);
      expect([row?.title, row?.status, row?.priority, row?.notes]).toEqual([
        'Keep me',
        'pending',
        'medium',
        'second',
      ]);
      expect(row).not.toHaveProperty('dueDate');
    });

    it('clears notes with null: it returns null and the stored field is removed', async () => {
      const user = await signInAs('priya');
      const task = await seed(user, 'Noted', 'to clear');
      const res = await patchAs(user, task.id, { notes: null }).expect(200);
      expect(res.body.task.notes).toBeNull();
      expect(await raw(task.id)).not.toHaveProperty('notes');
      const list = await listAs(user).expect(200);
      expect(list.body.tasks[0].notes).toBeNull();
    });

    it('clears notes with an empty or blank string the same way, never storing an empty string', async () => {
      const user = await signInAs('priya');
      for (const blank of ['', '   \n']) {
        const task = await seed(user, 'Noted ' + JSON.stringify(blank), 'to clear');
        const res = await patchAs(user, task.id, { notes: blank }).expect(200);
        expect(res.body.task.notes).toBeNull();
        expect(await raw(task.id)).not.toHaveProperty('notes');
      }
    });

    it('succeeds when clearing a task that has no notes, and when setting the same notes again', async () => {
      const user = await signInAs('priya');
      const bare = await seed(user, 'Bare');
      expect(
        (await patchAs(user, bare.id, { notes: null }).expect(200)).body.task.notes,
      ).toBeNull();
      const noted = await seed(user, 'Noted', 'same');
      await patchAs(user, noted.id, { notes: 'same' }).expect(200);
      expect((await patchAs(user, noted.id, { notes: 'same' }).expect(200)).body.task.notes).toBe(
        'same',
      );
    });

    it('clears a due date and notes together in one write', async () => {
      const user = await signInAs('priya');
      const task = await Task.create(
        buildTaskRow(user.id, { title: 'Both', notes: 'n', dueDate: '2026-11-20' }),
      );
      const res = await patchAs(user, task.id, { dueDate: null, notes: null }).expect(200);
      expect([res.body.task.dueDate, res.body.task.notes]).toEqual([null, null]);
      const row = await raw(task.id);
      expect(row).not.toHaveProperty('dueDate');
      expect(row).not.toHaveProperty('notes');
    });

    it('writes only the fields sent and updatedAt when notes change', async () => {
      const user = await signInAs('priya');
      const task = await seed(user, 'Only notes');
      await patchAs(user, task.id, { notes: 'x' }).expect(200);
      const row = await raw(task.id);
      expect([row?.title, row?.status, row?.updatedAt]).toEqual(['Only notes', 'pending', NOW]);
    });
  });

  describe('the length rule (AC-3)', () => {
    it('accepts notes of exactly 1000 characters on add and on change', async () => {
      const user = await signInAs('priya');
      const notes = 'x'.repeat(1000);
      const added = await addAs(user, { title: 'Long', notes }).expect(201);
      expect(added.body.task.notes).toBe(notes);
      const task = await seed(user, 'Long too');
      const res = await patchAs(user, task.id, { notes }).expect(200);
      expect(res.body.task.notes).toBe(notes);
      expect((await raw(task.id))?.notes).toBe(notes);
    });

    it('refuses 1001 characters on add, naming notes, and stores nothing', async () => {
      const user = await signInAs('priya');
      const res = await addAs(user, { title: 'Too long', notes: 'x'.repeat(1001) }).expect(400);
      const body = expectMatchesSchema(createTaskValidationSchema, res.body);
      expect(body.error.fields).toEqual({ notes: 'Notes can be at most 1000 characters.' });
      expect(await Task.countDocuments({})).toBe(0);
    });

    it('refuses 1001 characters on change, naming notes, and keeps the old notes', async () => {
      const user = await signInAs('priya');
      const task = await seed(user, 'Keep', 'old notes');
      const res = await patchAs(user, task.id, { notes: 'x'.repeat(1001) }).expect(400);
      const body = expectMatchesSchema(updateTaskValidationSchema, res.body);
      expect(body.error.fields).toEqual({ notes: 'Notes can be at most 1000 characters.' });
      expect((await raw(task.id))?.notes).toBe('old notes');
    });

    it('counts UTF-16 code units: 501 emoji are refused naming notes, never a server error', async () => {
      const user = await signInAs('priya');
      const task = await seed(user, 'Keep', 'old notes');
      const emoji = '\u{1F600}'.repeat(501);
      const added = await addAs(user, { title: 'Emoji', notes: emoji }).expect(400);
      expect(expectMatchesSchema(createTaskValidationSchema, added.body).error.fields).toEqual({
        notes: 'Notes can be at most 1000 characters.',
      });
      const changed = await patchAs(user, task.id, { notes: emoji }).expect(400);
      expect(expectMatchesSchema(updateTaskValidationSchema, changed.body).error.fields).toEqual({
        notes: 'Notes can be at most 1000 characters.',
      });
      expect((await raw(task.id))?.notes).toBe('old notes');
    });

    it('counts after the trim: 1000 characters in spaces pass, and blank notes store as no notes', async () => {
      const user = await signInAs('priya');
      const padded = await addAs(user, {
        title: 'Padded',
        notes: ' ' + 'x'.repeat(1000) + ' ',
      }).expect(201);
      expect(padded.body.task.notes).toBe('x'.repeat(1000));
      const blank = await addAs(user, { title: 'Blank', notes: '     ' }).expect(201);
      expect(blank.body.task.notes).toBeNull();
    });

    it('refuses notes that are not text, on add and on change', async () => {
      const user = await signInAs('priya');
      const task = await seed(user, 'Keep', 'old');
      const added = await addAs(user, { title: 'Number', notes: 42 }).expect(400);
      expect(expectMatchesSchema(createTaskValidationSchema, added.body).error.fields).toEqual({
        notes: 'Notes must be text.',
      });
      const changed = await patchAs(user, task.id, { notes: ['a'] }).expect(400);
      expect(expectMatchesSchema(updateTaskValidationSchema, changed.body).error.fields).toEqual({
        notes: 'Notes must be text.',
      });
      expect((await raw(task.id))?.notes).toBe('old');
    });

    it('treats a body of only notes as a change, and an empty body as a refusal naming notes', async () => {
      const user = await signInAs('priya');
      const task = await seed(user, 'Body');
      await patchAs(user, task.id, { notes: null }).expect(200);
      const empty = await patchAs(user, task.id, {}).expect(400);
      expect(expectMatchesSchema(updateTaskValidationSchema, empty.body).error.fields.body).toBe(
        'Provide a title, status, due date, priority, notes or tags',
      );
    });
  });

  describe('search stays on titles (AC-4)', () => {
    it('does not return a task whose notes alone hold the search word', async () => {
      const user = await signInAs('priya');
      await seed(user, 'Buy paint', 'ask about the zebra finish');
      await seed(user, 'Zebra crossing report');
      const res = await listAs(user, '?search=zebra').expect(200);
      const { tasks } = expectMatchesSchema(listTasksSuccessSchema, res.body);
      expect(tasks.map((t) => t.title)).toEqual(['Zebra crossing report']);
      const notesOnly = await listAs(user, '?search=finish').expect(200);
      expect(notesOnly.body.tasks).toEqual([]);
    });
  });

  describe('owner scoping (AC-5)', () => {
    it('never shows another user notes in a list', async () => {
      const owner = await signInAs('priya');
      const other = await signInAs('arjun');
      await seed(owner, 'Private', 'secret number 12345');
      const res = await listAs(other).expect(200);
      expect(res.body.tasks).toEqual([]);
      expect(JSON.stringify(res.body)).not.toContain('secret');
    });

    it('answers 404 to another user changing or clearing notes, and leaves them unchanged', async () => {
      const owner = await signInAs('priya');
      const intruder = await signInAs('arjun');
      const task = await seed(owner, 'Private', 'secret');
      for (const notes of ['hijacked', null]) {
        const res = await patchAs(intruder, task.id, { notes }).expect(404);
        expect(expectMatchesSchema(notFoundSchema, res.body).error.message).toBe('Task not found.');
      }
      expect((await raw(task.id))?.notes).toBe('secret');
    });

    it('refuses a caller with no session and changes nothing', async () => {
      const owner = await signInAs('priya');
      const task = await seed(owner, 'Private', 'secret');
      await request(app())
        .patch('/api/tasks/' + task.id)
        .send({ notes: null })
        .expect(401);
      expect((await raw(task.id))?.notes).toBe('secret');
    });
  });
});
