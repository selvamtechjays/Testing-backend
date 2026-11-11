// tier: integration
// requires: mongodb-memory-server (in-process, started by tests/integration/globalSetup.ts)
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../../src/models/Session.js';
import { Task } from '../../src/models/Task.js';
import { User } from '../../src/models/User.js';
import { unauthenticatedSchema } from '../support/authSchemas.js';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';
import { SIGN_IN_TIME, signInAs, type TestUser } from '../support/signIn.js';
import { notFoundSchema } from '../support/taskSchemas.js';

const NOW = new Date(SIGN_IN_TIME.getTime() + 60_000);
const app = () => createTestApp({ clock: () => NOW });
const T = (iso: string) => new Date(iso);

function deleteAs(user: TestUser, id: string) {
  return request(app()).delete(`/api/tasks/${id}`).set('Cookie', user.cookie);
}

function listAs(user: TestUser) {
  return request(app()).get('/api/tasks').set('Cookie', user.cookie);
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

const exists = async (id: string) =>
  (await Task.countDocuments({ _id: new mongoose.Types.ObjectId(id) })) === 1;

describe('delete a task against a real database (FEAT-TASK-03)', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init(), Task.init()]);
  });

  it('deletes the owner pending task with 204 and no body, and it leaves the list (AC-1, AC-6, BR-1, BR-3, TS-1, TS-8)', async () => {
    const user = await signInAs('priya');
    const task = await seedTask(user, 'Old idea', T('2026-03-01T09:00:00.000Z'));
    const res = await deleteAs(user, task.id).expect(204);
    expect(res.text).toBe('');
    expect(res.headers['content-type']).toBeUndefined();
    expect(await exists(task.id)).toBe(false);
    const list = await listAs(user).expect(200);
    expect(list.body.tasks).toEqual([]);
  });

  it('deletes a completed task in the same way (AC-4, BR-1, TS-4)', async () => {
    const user = await signInAs('priya');
    const task = await seedTask(user, 'Done', T('2026-03-01T09:00:00.000Z'), 'completed');
    await deleteAs(user, task.id).expect(204);
    expect(await exists(task.id)).toBe(false);
  });

  it('removes the row for good: there is no trash, soft-delete flag or restore (AC-5, AC-6, BR-3)', async () => {
    const user = await signInAs('priya');
    const task = await seedTask(user, 'Gone', T('2026-03-01T09:00:00.000Z'));
    await deleteAs(user, task.id).expect(204);
    expect(await Task.collection.countDocuments({})).toBe(0);
    await request(app())
      .post(`/api/tasks/${task.id}/restore`)
      .set('Cookie', user.cookie)
      .expect(404);
  });

  it('answers 404 for a second delete of the same id (R-3)', async () => {
    const user = await signInAs('priya');
    const task = await seedTask(user, 'Once', T('2026-03-01T09:00:00.000Z'));
    await deleteAs(user, task.id).expect(204);
    const res = await deleteAs(user, task.id).expect(404);
    expect(expectMatchesSchema(notFoundSchema, res.body).error.message).toBe('Task not found.');
  });

  it('answers 404 for another user task and leaves it untouched (R-1, NFR data classification)', async () => {
    const owner = await signInAs('priya');
    const intruder = await signInAs('arjun');
    const task = await seedTask(owner, 'Private', T('2026-03-01T09:00:00.000Z'));
    const res = await deleteAs(intruder, task.id).expect(404);
    expect(expectMatchesSchema(notFoundSchema, res.body).error.message).toBe('Task not found.');
    expect(await exists(task.id)).toBe(true);
    const list = await listAs(owner).expect(200);
    expect(list.body.tasks).toHaveLength(1);
  });

  it('answers the same 404 for a missing id and a malformed id (R-2)', async () => {
    const user = await signInAs('priya');
    for (const id of ['0123456789abcdef01234567', 'not-an-id', 'abcdefghijkl']) {
      const res = await deleteAs(user, id).expect(404);
      expect(expectMatchesSchema(notFoundSchema, res.body).error.message).toBe('Task not found.');
    }
  });

  it('ignores any request body (inputs)', async () => {
    const user = await signInAs('priya');
    const task = await seedTask(user, 'Body ignored', T('2026-03-01T09:00:00.000Z'));
    await request(app())
      .delete(`/api/tasks/${task.id}`)
      .set('Cookie', user.cookie)
      .send({ ownerId: 'someone-else', title: 'x' })
      .expect(204);
    expect(await exists(task.id)).toBe(false);
  });

  it('refuses a caller with no session and deletes nothing (AC-1, R-4)', async () => {
    const owner = await signInAs('priya');
    const task = await seedTask(owner, 'Private', T('2026-03-01T09:00:00.000Z'));
    const res = await request(app()).delete(`/api/tasks/${task.id}`).expect(401);
    expectMatchesSchema(unauthenticatedSchema, res.body);
    expect(await exists(task.id)).toBe(true);
  });

  it('refuses an expired session and deletes nothing (R-4)', async () => {
    const owner = await signInAs('priya');
    const task = await seedTask(owner, 'Private', T('2026-03-01T09:00:00.000Z'));
    const afterExpiry = new Date(SIGN_IN_TIME.getTime() + 25 * 60 * 60 * 1000);
    await request(createTestApp({ clock: () => afterExpiry }))
      .delete(`/api/tasks/${task.id}`)
      .set('Cookie', owner.cookie)
      .expect(401);
    expect(await exists(task.id)).toBe(true);
  });

  it('leaves the remaining tasks in their order and the other user list alone (TS-11)', async () => {
    const priya = await signInAs('priya');
    const arjun = await signInAs('arjun');
    await seedTask(priya, 'First', T('2026-03-01T09:00:00.000Z'));
    const middle = await seedTask(priya, 'Middle', T('2026-03-01T09:30:00.000Z'));
    await seedTask(priya, 'Last', T('2026-03-01T09:45:00.000Z'));
    await seedTask(arjun, 'Arjun task', T('2026-03-01T09:10:00.000Z'));
    await deleteAs(priya, middle.id).expect(204);
    const list = await listAs(priya).expect(200);
    expect(list.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Last', 'First']);
    const other = await listAs(arjun).expect(200);
    expect(other.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Arjun task']);
  });

  it('empties the list when the only task is deleted (TS-11)', async () => {
    const user = await signInAs('priya');
    const only = await seedTask(user, 'Only task', T('2026-03-01T09:00:00.000Z'));
    await deleteAs(user, only.id).expect(204);
    const list = await listAs(user).expect(200);
    expect(list.body).toEqual({ tasks: [] });
  });
});
