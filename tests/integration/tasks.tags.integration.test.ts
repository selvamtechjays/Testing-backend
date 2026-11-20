// tier: integration
// requires: mongodb-memory-server (in-process, started by tests/integration/globalSetup.ts)
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../../src/models/Session.js';
import { Tag } from '../../src/models/Tag.js';
import { Task } from '../../src/models/Task.js';
import { User } from '../../src/models/User.js';
import { unauthenticatedSchema } from '../support/authSchemas.js';
import { buildTagRow, buildTaskRow } from '../support/builders.js';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';
import { SIGN_IN_TIME, signInAs, type TestUser } from '../support/signIn.js';
import {
  createTaskSuccessSchema,
  createTaskValidationSchema,
  listTagsSuccessSchema,
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
const deleteAs = (user: TestUser, id: string) =>
  request(app())
    .delete('/api/tasks/' + id)
    .set('Cookie', user.cookie);
const tagsAs = (user: TestUser) => request(app()).get('/api/tags').set('Cookie', user.cookie);

const raw = (id: string) => Task.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
const stringIds = (list: unknown) => ((list ?? []) as mongoose.Types.ObjectId[]).map(String);

const OWN = 'Tags must be your own tags.';
const TOO_MANY = 'A task can have up to 5 tags.';

/** Tags for the owner in slots 0..n-1, returned in the order of `names`. */
async function seedTags(owner: TestUser, names: string[]) {
  const rows = names.map((name, slot) => buildTagRow(owner.id, { name, slot }));
  return Tag.insertMany(rows);
}

async function seedTask(owner: TestUser, title: string, tagIds?: mongoose.Types.ObjectId[]) {
  return Task.create({ ...buildTaskRow(owner.id, { title }), ...(tagIds ? { tagIds } : {}) });
}

describe('tagging tasks against a real database (Task-29, FEAT-TAG-03)', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init(), Task.init(), Tag.init()]);
  });

  describe('create and update with tag ids (AC-1, AC-2, AC-3, AC-4, AC-10)', () => {
    it('returns both tags, sorted by name ignoring case, on create and again on update (AC-1)', async () => {
      const user = await signInAs('priya');
      // Byte order would be Cherry, apple, banana; ignoring case it is apple, banana, Cherry.
      const tags = await seedTags(user, ['banana', 'Cherry', 'apple']);
      const ids = tags.map((t) => t.id);
      const idOf = (name: string) => tags.find((t) => t.name === name)?.id;
      const inNameOrder = ['apple', 'banana', 'Cherry'].map(idOf);
      const created = await addAs(user, { title: 'Shop', tagIds: ids }).expect(201);
      const { task } = expectMatchesSchema(createTaskSuccessSchema, created.body);
      expect(task.tags.map((t) => t.name)).toEqual(['apple', 'banana', 'Cherry']);
      expect(task.tags.map((t) => t.colour)).toEqual(['gray', 'gray', 'gray']);
      const other = await seedTask(user, 'Other');
      const updated = await patchAs(user, other.id, { tagIds: ids }).expect(200);
      const body = expectMatchesSchema(updateTaskSuccessSchema, updated.body);
      expect(body.task.tags.map((t) => t.id)).toEqual(inNameOrder);
      expect(stringIds((await raw(task.id))?.tagIds).sort()).toEqual([...ids].sort());
    });

    it('removes every tag for an empty list, and leaves them alone when the key is left out (AC-2)', async () => {
      const user = await signInAs('priya');
      const [home] = await seedTags(user, ['Home']);
      const task = await seedTask(user, 'Tagged', [home?._id as mongoose.Types.ObjectId]);
      const kept = await patchAs(user, task.id, { title: 'Renamed' }).expect(200);
      expect(kept.body.task.tags.map((t: { name: string }) => t.name)).toEqual(['Home']);
      expect(stringIds((await raw(task.id))?.tagIds)).toEqual([home?.id]);
      const cleared = await patchAs(user, task.id, { tagIds: [] }).expect(200);
      expect(cleared.body.task.tags).toEqual([]);
      expect((await raw(task.id))?.tagIds).toEqual([]);
    });

    it('accepts six ids that hold a repeat, and saves the five distinct tags once each (AC-3)', async () => {
      const user = await signInAs('priya');
      const tags = await seedTags(user, ['a', 'b', 'c', 'd', 'e']);
      const ids = [...tags.map((t) => t.id), tags[0]?.id.toUpperCase()];
      const res = await addAs(user, { title: 'Five', tagIds: ids }).expect(201);
      expect(res.body.task.tags).toHaveLength(5);
      expect(stringIds((await raw(res.body.task.id))?.tagIds)).toHaveLength(5);
    });

    it('accepts a save carrying only tag ids, and one carrying only an empty list, as valid updates (AC-10)', async () => {
      const user = await signInAs('priya');
      const [home] = await seedTags(user, ['Home']);
      const task = await seedTask(user, 'Only tags');
      await patchAs(user, task.id, { tagIds: [home?.id] }).expect(200);
      await patchAs(user, task.id, { tagIds: [] }).expect(200);
      const row = await raw(task.id);
      expect([row?.title, row?.status, row?.priority]).toEqual(['Only tags', 'pending', 'medium']);
      expect(row?.updatedAt).toEqual(NOW);
    });

    it('stores no tagIds field for a task added with no tags or an empty list (AC-4)', async () => {
      const user = await signInAs('priya');
      for (const body of [{ title: 'none' }, { title: 'empty', tagIds: [] }]) {
        const res = await addAs(user, body).expect(201);
        expect(res.body.task.tags, body.title).toEqual([]);
        expect(await raw(res.body.task.id), body.title).not.toHaveProperty('tagIds');
      }
    });

    it('writes only the fields sent and updatedAt when tags change, leaving every other field alone (AC-10)', async () => {
      const user = await signInAs('priya');
      const [home] = await seedTags(user, ['Home']);
      const task = await Task.create({
        ...buildTaskRow(user.id, { title: 'Keep', dueDate: '2026-04-01', notes: 'n' }),
      });
      await patchAs(user, task.id, { tagIds: [home?.id] }).expect(200);
      const row = await raw(task.id);
      expect([row?.title, row?.dueDate, row?.notes, row?.priority, row?.status]).toEqual([
        'Keep',
        '2026-04-01',
        'n',
        'medium',
        'pending',
      ]);
      expect(row?.createdAt).toEqual(task.createdAt);
    });
  });

  describe('every task carries its tags (AC-4)', () => {
    it('returns a tags list on every task, empty for a row written before tags existed (AC-4)', async () => {
      const user = await signInAs('priya');
      const [home] = await seedTags(user, ['Home']);
      await seedTask(user, 'Tagged', [home?._id as mongoose.Types.ObjectId]);
      await Task.collection.insertOne({
        ownerId: new mongoose.Types.ObjectId(user.id),
        title: 'Written before tags',
        status: 'pending',
        createdAt: new Date('2026-03-01T09:00:00.000Z'),
        updatedAt: new Date('2026-03-01T09:00:00.000Z'),
      });
      const res = await listAs(user).expect(200);
      const { tasks } = expectMatchesSchema(listTasksSuccessSchema, res.body);
      expect(Object.fromEntries(tasks.map((t) => [t.title, t.tags.map((x) => x.name)]))).toEqual({
        Tagged: ['Home'],
        'Written before tags': [],
      });
    });

    it('carries tags on every list sort, including the aggregation paths (AC-1, AC-4)', async () => {
      const user = await signInAs('priya');
      // Byte order would be Work, home; ignoring case it is home, Work.
      const [home, work] = await seedTags(user, ['home', 'Work']);
      await seedTask(user, 'with', [work?._id, home?._id] as mongoose.Types.ObjectId[]);
      await seedTask(user, 'without');
      for (const sort of ['newest', 'due', 'priority']) {
        const res = await listAs(user, '?sort=' + sort).expect(200);
        const byTitle = Object.fromEntries(
          expectMatchesSchema(listTasksSuccessSchema, res.body).tasks.map((t) => [
            t.title,
            t.tags.map((x) => x.name),
          ]),
        );
        expect(byTitle, sort).toEqual({ with: ['home', 'Work'], without: [] });
      }
    });

    it('skips a stray tag id whose tag no longer exists (AC-25)', async () => {
      const user = await signInAs('priya');
      const [home] = await seedTags(user, ['Home']);
      const gone = new mongoose.Types.ObjectId();
      await seedTask(user, 'Stray', [gone, home?._id as mongoose.Types.ObjectId]);
      const res = await listAs(user).expect(200);
      expect(res.body.tasks[0].tags.map((t: { name: string }) => t.name)).toEqual(['Home']);
    });

    it('never matches a tag name in the title search (AC-29)', async () => {
      const user = await signInAs('priya');
      const [groceries] = await seedTags(user, ['Groceries']);
      await seedTask(user, 'Buy milk', [groceries?._id as mongoose.Types.ObjectId]);
      await seedTask(user, 'Groceries list');
      const res = await listAs(user, '?search=Groceries').expect(200);
      expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Groceries list']);
    });
  });

  describe('refusals (AC-11 to AC-16)', () => {
    it('refuses the id of a tag that was deleted, 400 naming tagIds, like an unknown id (AC-25, TS-27)', async () => {
      const user = await signInAs('priya');
      const [gone] = await seedTags(user, ['Gone']);
      const task = await seedTask(user, 'Mine');
      await request(app())
        .delete('/api/tags/' + gone?.id)
        .set('Cookie', user.cookie)
        .expect(204);
      const res = await patchAs(user, task.id, { tagIds: [gone?.id] }).expect(400);
      expect(expectMatchesSchema(updateTaskValidationSchema, res.body).error.fields).toEqual({
        tagIds: OWN,
      });
      expect(await raw(task.id)).not.toHaveProperty('tagIds');
    });

    it('refuses a sixth distinct tag naming tagIds, and changes nothing on create and update (AC-11)', async () => {
      const user = await signInAs('priya');
      const tags = await seedTags(user, ['a', 'b', 'c', 'd', 'e', 'f']);
      const ids = tags.map((t) => t.id);
      const create = await addAs(user, { title: 'Six', tagIds: ids }).expect(400);
      expect(expectMatchesSchema(createTaskValidationSchema, create.body).error.fields).toEqual({
        tagIds: TOO_MANY,
      });
      expect(await Task.countDocuments()).toBe(0);
      const task = await seedTask(user, 'Keep', [tags[0]?._id as mongoose.Types.ObjectId]);
      const update = await patchAs(user, task.id, { title: 'Changed', tagIds: ids }).expect(400);
      expect(expectMatchesSchema(updateTaskValidationSchema, update.body).error.fields).toEqual({
        tagIds: TOO_MANY,
      });
      const row = await raw(task.id);
      expect([row?.title, stringIds(row?.tagIds)]).toEqual(['Keep', [tags[0]?.id]]);
    });

    it('answers an unknown, another user and a malformed tag id identically, 400 naming tagIds (AC-12, AC-13, AC-14)', async () => {
      const user = await signInAs('priya');
      const other = await signInAs('ravi');
      const [theirs] = await seedTags(other, ['Theirs']);
      const task = await seedTask(user, 'Mine');
      const unknown = new mongoose.Types.ObjectId().toString();
      const bodies = [];
      for (const bad of [unknown, theirs?.id, 'not-an-id']) {
        const create = await addAs(user, { title: 'New', tagIds: [bad] }).expect(400);
        const update = await patchAs(user, task.id, { tagIds: [bad] }).expect(400);
        expect(create.body.error.fields).toEqual({ tagIds: OWN });
        bodies.push(create.body, update.body);
      }
      expect(bodies[0]).toEqual(bodies[2]);
      expect(bodies[2]).toEqual(bodies[4]);
      expect(bodies[1]).toEqual(bodies[3]);
      expect(bodies[3]).toEqual(bodies[5]);
      expectMatchesSchema(updateTaskValidationSchema, bodies[1]);
      expect(await Task.countDocuments({ title: 'New' })).toBe(0);
      expect(await raw(task.id)).not.toHaveProperty('tagIds');
    });

    it('saves nothing when one bad tag id sits among good ones, on create and update (AC-15)', async () => {
      const user = await signInAs('priya');
      const [home] = await seedTags(user, ['Home']);
      const bad = new mongoose.Types.ObjectId().toString();
      await addAs(user, { title: 'Nope', tagIds: [home?.id, bad] }).expect(400);
      expect(await Task.countDocuments()).toBe(0);
      const task = await seedTask(user, 'Keep');
      await patchAs(user, task.id, {
        title: 'Changed',
        priority: 'high',
        tagIds: [home?.id, bad],
      }).expect(400);
      const row = await raw(task.id);
      expect([row?.title, row?.priority]).toEqual(['Keep', 'medium']);
      expect(row).not.toHaveProperty('tagIds');
    });

    it('refuses a create and an update with no session, 401, and saves nothing (AC-16)', async () => {
      const user = await signInAs('priya');
      const [home] = await seedTags(user, ['Home']);
      const task = await seedTask(user, 'Mine');
      const create = await request(app())
        .post('/api/tasks')
        .send({ title: 'x', tagIds: [home?.id] })
        .expect(401);
      expectMatchesSchema(unauthenticatedSchema, create.body);
      const update = await request(app())
        .patch('/api/tasks/' + task.id)
        .send({ tagIds: [home?.id] })
        .expect(401);
      expectMatchesSchema(unauthenticatedSchema, update.body);
      expect(await Task.countDocuments()).toBe(1);
      expect(await raw(task.id)).not.toHaveProperty('tagIds');
    });

    it('still answers 404 for another user task, even with valid tags in the body (AC-16)', async () => {
      const user = await signInAs('priya');
      const other = await signInAs('ravi');
      const [mine] = await seedTags(user, ['Mine']);
      const theirTask = await seedTask(other, 'Theirs');
      const res = await patchAs(user, theirTask.id, { tagIds: [mine?.id] }).expect(404);
      expectMatchesSchema(notFoundSchema, res.body);
      expect(await raw(theirTask.id)).not.toHaveProperty('tagIds');
    });
  });

  describe('delete (AC-9)', () => {
    it('removes a deleted task with its tag links and leaves the tag with a count one lower (AC-9)', async () => {
      const user = await signInAs('priya');
      const [work] = await seedTags(user, ['Work']);
      const ids = [work?._id as mongoose.Types.ObjectId];
      const one = await seedTask(user, 'one', ids);
      await seedTask(user, 'two', ids);
      const before = expectMatchesSchema(listTagsSuccessSchema, (await tagsAs(user)).body);
      expect(before.tags[0]?.taskCount).toBe(2);
      await deleteAs(user, one.id).expect(204);
      const after = expectMatchesSchema(listTagsSuccessSchema, (await tagsAs(user)).body);
      expect(after.tags.map((t) => [t.name, t.taskCount])).toEqual([['Work', 1]]);
      expect(await Tag.countDocuments()).toBe(1);
    });
  });
});
