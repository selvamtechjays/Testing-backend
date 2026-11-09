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
  createTaskSuccessSchema,
  createTaskValidationSchema,
  listTasksSuccessSchema,
} from '../support/taskSchemas.js';

const NOW = new Date(SIGN_IN_TIME.getTime() + 60_000);
const app = () => createTestApp({ clock: () => NOW });

function listAs(user: TestUser) {
  return request(app()).get('/api/tasks').set('Cookie', user.cookie);
}

function addAs(user: TestUser, body: unknown) {
  return request(app())
    .post('/api/tasks')
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

describe('list and add tasks against a real database (FEAT-TASK-01)', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init(), Task.init()]);
  });

  it('returns an empty list for a user with no tasks (AC-3, TS-2)', async () => {
    const user = await signInAs('priya');
    const res = await listAs(user).expect(200);
    expect(expectMatchesSchema(listTasksSuccessSchema, res.body).tasks).toEqual([]);
  });

  it('lists the owner tasks newest first with their status, completed ones included (AC-1, AC-2, AC-9, BR-5, TS-1, TS-14)', async () => {
    const user = await signInAs('priya');
    await seedTask(user, 'Send logo', new Date('2026-03-01T09:00:00.000Z'), 'completed');
    await seedTask(user, 'Pay hosting invoice', new Date('2026-03-01T09:30:00.000Z'));
    await seedTask(user, 'Plan launch', new Date('2026-03-01T09:45:00.000Z'));
    const res = await listAs(user).expect(200);
    const { tasks } = expectMatchesSchema(listTasksSuccessSchema, res.body);
    expect(tasks.map((t) => [t.title, t.status])).toEqual([
      ['Plan launch', 'pending'],
      ['Pay hosting invoice', 'pending'],
      ['Send logo', 'completed'],
    ]);
  });

  it('breaks a tie on equal creation times by newest id first (AC-11, TS-17)', async () => {
    const user = await signInAs('priya');
    const sameInstant = new Date('2026-03-01T09:00:00.000Z');
    await seedTask(user, 'first', sameInstant);
    await seedTask(user, 'second', sameInstant);
    await seedTask(user, 'third', sameInstant);
    const res = await listAs(user).expect(200);
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual([
      'third',
      'second',
      'first',
    ]);
  });

  it('adds a pending task owned by the caller, stamped with the server clock (AC-4, BR-3, TS-3)', async () => {
    const user = await signInAs('priya');
    const res = await addAs(user, { title: 'Send brand colours to Techjays' }).expect(201);
    const { task } = expectMatchesSchema(createTaskSuccessSchema, res.body);
    expect(task.title).toBe('Send brand colours to Techjays');
    expect(task.createdAt).toBe(NOW.toISOString());
    const stored = await Task.findById(task.id).lean();
    expect(stored?.ownerId.toString()).toBe(user.id);
    expect(stored?.status).toBe('pending');
  });

  it('shows a new task above older ones (AC-4, AC-11, TS-3)', async () => {
    const user = await signInAs('priya');
    await seedTask(user, 'Older task', new Date('2026-03-01T09:00:00.000Z'));
    await addAs(user, { title: 'Brand new task' }).expect(201);
    const res = await listAs(user).expect(200);
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual([
      'Brand new task',
      'Older task',
    ]);
  });

  it('accepts a one-character title and a 200-character title in full (AC-5, TS-5, TS-6)', async () => {
    const user = await signInAs('priya');
    await addAs(user, { title: 'a' }).expect(201);
    const long = 'x'.repeat(200);
    const res = await addAs(user, { title: long }).expect(201);
    expect(res.body.task.title).toBe(long);
  });

  it('trims the title before storing it (DEC-062)', async () => {
    const user = await signInAs('priya');
    const res = await addAs(user, { title: '   Pay hosting invoice  ' }).expect(201);
    expect(res.body.task.title).toBe('Pay hosting invoice');
  });

  it('refuses a 201-character title with the too-long message and stores nothing (AC-7, BR-2)', async () => {
    const user = await signInAs('priya');
    const res = await addAs(user, { title: 'x'.repeat(201) }).expect(400);
    const body = expectMatchesSchema(createTaskValidationSchema, res.body);
    expect(body.error.fields.title).toBe('Titles can be at most 200 characters.');
    expect(await Task.countDocuments()).toBe(0);
  });

  it('refuses an empty, whitespace-only, missing or non-string title and stores nothing (AC-6, BR-1, TS-8)', async () => {
    const user = await signInAs('priya');
    for (const body of [{ title: '' }, { title: '   ' }, {}, { title: 42 }, []]) {
      const res = await addAs(user, body).expect(400);
      const parsed = expectMatchesSchema(createTaskValidationSchema, res.body);
      expect(parsed.error.fields.title).toBe('Enter a title.');
    }
    expect(await Task.countDocuments()).toBe(0);
  });

  it('ignores a body status or owner and forces pending for the caller (BR-3, BR-6)', async () => {
    const caller = await signInAs('priya');
    const other = await signInAs('arjun');
    const res = await addAs(caller, {
      title: 'Sneaky',
      status: 'completed',
      ownerId: other.id,
    }).expect(201);
    expect(res.body.task.status).toBe('pending');
    const stored = await Task.findById(res.body.task.id).lean();
    expect(stored?.ownerId.toString()).toBe(caller.id);
    expect(await Task.countDocuments({ ownerId: new mongoose.Types.ObjectId(other.id) })).toBe(0);
  });

  it('stores only the title, status, owner and times: no description, notes, due date or priority (AC-8, BR-1)', async () => {
    const user = await signInAs('priya');
    const res = await addAs(user, {
      title: 'Just a title',
      description: 'd',
      notes: 'n',
      dueDate: '2026-04-01',
      priority: 'high',
    }).expect(201);
    expect(Object.keys(res.body.task).sort()).toEqual(['createdAt', 'id', 'status', 'title']);
    const raw = await Task.collection.findOne({
      _id: new mongoose.Types.ObjectId(res.body.task.id),
    });
    expect(Object.keys(raw ?? {}).sort()).toEqual(
      ['__v', '_id', 'createdAt', 'ownerId', 'status', 'title', 'updatedAt'].sort(),
    );
  });

  it('round-trips emoji, accented and CJK characters exactly (TS-7)', async () => {
    const user = await signInAs('priya');
    const title = 'Café 会議 🎉';
    await addAs(user, { title }).expect(201);
    const res = await listAs(user).expect(200);
    expect(res.body.tasks[0].title).toBe(title);
  });

  it('returns HTML-looking titles verbatim as JSON text, never interpreted (TS-12)', async () => {
    const user = await signInAs('priya');
    const title = '<script>alert(1)</script>';
    const res = await addAs(user, { title }).expect(201);
    expect(res.body.task.title).toBe(title);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('never shows or touches another user tasks (AC-10, BR-6, TS-15)', async () => {
    const priya = await signInAs('priya');
    const arjun = await signInAs('arjun');
    await seedTask(priya, 'Priya private', new Date('2026-03-01T09:00:00.000Z'));
    await addAs(priya, { title: 'Priya added' }).expect(201);
    const asArjun = await listAs(arjun).expect(200);
    expect(asArjun.body.tasks).toEqual([]);
    await addAs(arjun, { title: 'Arjun added' }).expect(201);
    const asPriya = await listAs(priya).expect(200);
    expect(asPriya.body.tasks.map((t: { title: string }) => t.title).sort()).toEqual([
      'Priya added',
      'Priya private',
    ]);
  });

  it('refuses both operations without a session and writes nothing (AC-10)', async () => {
    await request(app()).get('/api/tasks').expect(401);
    await request(app()).post('/api/tasks').send({ title: 'No session' }).expect(401);
    expect(await Task.countDocuments()).toBe(0);
  });

  it('refuses an expired session (AC-10)', async () => {
    const user = await signInAs('priya');
    const afterExpiry = new Date(SIGN_IN_TIME.getTime() + 25 * 60 * 60 * 1000);
    await request(createTestApp({ clock: () => afterExpiry }))
      .get('/api/tasks')
      .set('Cookie', user.cookie)
      .expect(401);
  });

  it('creates the per-owner newest-first index (DEC-052)', async () => {
    await Task.init();
    const indexes = await Task.collection.indexes();
    expect(indexes.some((i) => JSON.stringify(i.key) === '{"ownerId":1,"createdAt":-1}')).toBe(
      true,
    );
  });
});
