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
import { buildTagRow, buildTagRows, buildTaskRow } from '../support/builders.js';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';
import { SIGN_IN_TIME, signInAs, type TestUser } from '../support/signIn.js';
import {
  listTagsSuccessSchema,
  listTasksSuccessSchema,
  tagNotFoundSchema,
  updateTagSuccessSchema,
  updateTagValidationSchema,
} from '../support/taskSchemas.js';

const NOW = new Date(SIGN_IN_TIME.getTime() + 60_000);
const app = () => createTestApp({ clock: () => NOW });

const patchAs = (user: TestUser, id: string, body: unknown) =>
  request(app())
    .patch('/api/tags/' + id)
    .set('Cookie', user.cookie)
    .send(body as object);
const deleteAs = (user: TestUser, id: string) =>
  request(app())
    .delete('/api/tags/' + id)
    .set('Cookie', user.cookie);
const tagsAs = (user: TestUser) => request(app()).get('/api/tags').set('Cookie', user.cookie);
const tasksAs = (user: TestUser) => request(app()).get('/api/tasks').set('Cookie', user.cookie);
const createTagAs = (user: TestUser, body: unknown) =>
  request(app())
    .post('/api/tags')
    .set('Cookie', user.cookie)
    .send(body as object);

const oid = (id: string) => new mongoose.Types.ObjectId(id);
const storedTag = (id: string) => Tag.findById(id).lean();
const rawTask = (id: string) => Task.collection.findOne({ _id: oid(id) });
const idsOf = (list: unknown) => ((list ?? []) as mongoose.Types.ObjectId[]).map(String);

const DUPLICATE = 'You already have a tag with that name.';

function expectRefusal(res: request.Response, field: 'name' | 'colour' | 'body', message: string) {
  expect(res.status).toBe(400);
  const body = expectMatchesSchema(updateTagValidationSchema, res.body);
  expect(body.error.fields).toEqual({ [field]: message });
}

/** Tags in slots 0..n-1 for the owner, in the order of `names`. */
async function seedTags(owner: TestUser, names: string[]) {
  return Tag.insertMany(names.map((name, slot) => buildTagRow(owner.id, { name, slot })));
}

const seedTask = (owner: TestUser, title: string, tagIds: mongoose.Types.ObjectId[] = []) =>
  Task.create({
    ...buildTaskRow(owner.id, { title }),
    ...(tagIds.length > 0 ? { tagIds } : {}),
  });

/** Work, Home and Errands, and four tasks: a has all three tags, b only Work, c only Home, d none. */
async function seedMixed(owner: TestUser) {
  const [work, home, errands] = await seedTags(owner, ['Work', 'Home', 'Errands']);
  const only = (...tags: (typeof work)[]) => tags.map((t) => t?._id) as mongoose.Types.ObjectId[];
  const a = await seedTask(owner, 'a', only(work, home, errands));
  const b = await seedTask(owner, 'b', only(work));
  const c = await seedTask(owner, 'c', only(home));
  const d = await seedTask(owner, 'd');
  return {
    work: work?.id as string,
    home: home?.id as string,
    errands: errands?.id as string,
    a: a.id as string,
    b: b.id as string,
    c: c.id as string,
    d: d.id as string,
  };
}

describe('rename, recolour and delete tags against a real database (Task-33, FEAT-TAG-02)', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init(), Task.init(), Tag.init()]);
  });

  describe('rename and recolour (AC-2, AC-3, AC-16)', () => {
    it('renames a tag, returns it with a fresh task count, and shows the new name on every task row (AC-2)', async () => {
      const user = await signInAs('priya');
      const [work, home] = await seedTags(user, ['Work', 'Home']);
      await seedTask(user, 'one', [work?._id, home?._id] as mongoose.Types.ObjectId[]);
      await seedTask(user, 'two', [work?._id] as mongoose.Types.ObjectId[]);
      const res = await patchAs(user, work?.id, { name: 'Office' }).expect(200);
      const { tag } = expectMatchesSchema(updateTagSuccessSchema, res.body);
      expect(tag).toEqual({ id: work?.id, name: 'Office', colour: 'gray', taskCount: 2 });
      const tasks = expectMatchesSchema(listTasksSuccessSchema, (await tasksAs(user)).body).tasks;
      const chips = tasks.flatMap((t) => t.tags.map((x) => x.name));
      expect(chips.sort()).toEqual(['Home', 'Office', 'Office']);
      expect((await storedTag(work?.id))?.updatedAt).toEqual(NOW);
    });

    it('recolours a tag and changes the colour on every chip of it (AC-3)', async () => {
      const user = await signInAs('priya');
      const [work] = await seedTags(user, ['Work']);
      await seedTask(user, 'one', [work?._id] as mongoose.Types.ObjectId[]);
      const res = await patchAs(user, work?.id, { colour: 'blue' }).expect(200);
      expect(res.body.tag).toMatchObject({ name: 'Work', colour: 'blue', taskCount: 1 });
      const tasks = expectMatchesSchema(listTasksSuccessSchema, (await tasksAs(user)).body).tasks;
      expect(tasks[0]?.tags.map((t) => t.colour)).toEqual(['blue']);
    });

    it('changes a name and a colour together and never touches the owner or the slot (AC-2, AC-3)', async () => {
      const user = await signInAs('priya');
      const [, second] = await seedTags(user, ['a', 'b']);
      await patchAs(user, second?.id, {
        name: 'Bee',
        colour: 'red',
        slot: 40,
        ownerId: 'x',
      }).expect(200);
      const stored = await storedTag(second?.id);
      expect([stored?.name, stored?.colour, stored?.slot]).toEqual(['Bee', 'red', 1]);
      expect(stored?.ownerId.toString()).toBe(user.id);
    });

    it('allows changing only the letter case of the tag own name, and a change that alters nothing (AC-16, BR-1, BR-3)', async () => {
      const user = await signInAs('priya');
      const [work] = await seedTags(user, ['Work']);
      const lower = await patchAs(user, work?.id, { name: 'work' }).expect(200);
      expect(lower.body.tag.name).toBe('work');
      const same = await patchAs(user, work?.id, { name: 'work', colour: 'gray' }).expect(200);
      expect(same.body.tag).toMatchObject({ name: 'work', colour: 'gray' });
      expect((await storedTag(work?.id))?.name).toBe('work');
    });

    it('accepts names of 1 and 30 characters, markup and emoji exactly as typed on a rename (AC-10)', async () => {
      const user = await signInAs('priya');
      const [tag] = await seedTags(user, ['Work']);
      const names = ['a', 'n'.repeat(30), '<img src=x onerror=alert(1)>', '😀'.repeat(15), 'Café'];
      for (const name of names) {
        const res = await patchAs(user, tag?.id, { name }).expect(200);
        expect(res.body.tag.name, name).toBe(name);
      }
    });
  });

  describe('refused renames and recolours (AC-9 to AC-12)', () => {
    it('refuses a rename to another tag name ignoring case, naming name, and changes nothing (AC-9)', async () => {
      const user = await signInAs('priya');
      const [home, office] = await seedTags(user, ['Home', 'Office']);
      expectRefusal(await patchAs(user, home?.id, { name: 'office' }), 'name', DUPLICATE);
      expectRefusal(
        await patchAs(user, home?.id, { name: 'OFFICE', colour: 'red' }),
        'name',
        DUPLICATE,
      );
      const stored = await storedTag(home?.id);
      expect([stored?.name, stored?.colour]).toEqual(['Home', 'gray']);
      expect((await storedTag(office?.id))?.name).toBe('Office');
    });

    it('refuses an accented clash and lets another user hold the same name (AC-9, BR-1)', async () => {
      const user = await signInAs('priya');
      const other = await signInAs('ravi');
      const [cafe, plain] = await seedTags(user, ['Café', 'Plain']);
      await seedTags(other, ['Shared']);
      expectRefusal(await patchAs(user, plain?.id, { name: 'cafÉ' }), 'name', DUPLICATE);
      await patchAs(user, cafe?.id, { name: 'Shared' }).expect(200);
    });

    it('refuses an empty, whitespace-only and 31-character name, naming name, and changes nothing (AC-10)', async () => {
      const user = await signInAs('priya');
      const [work] = await seedTags(user, ['Work']);
      const required = 'Enter a tag name.';
      expectRefusal(await patchAs(user, work?.id, { name: '' }), 'name', required);
      expectRefusal(await patchAs(user, work?.id, { name: '   ' }), 'name', required);
      expectRefusal(
        await patchAs(user, work?.id, { name: 'n'.repeat(31) }),
        'name',
        'Tag names can be at most 30 characters.',
      );
      expectRefusal(
        await patchAs(user, work?.id, { name: '😀'.repeat(16) }),
        'name',
        'Tag names can be at most 30 characters.',
      );
      expectRefusal(await patchAs(user, work?.id, { name: 5 }), 'name', 'Tag name must be text.');
      expect((await storedTag(work?.id))?.name).toBe('Work');
    });

    it('refuses a colour outside the six, naming colour, and changes nothing (AC-11)', async () => {
      const user = await signInAs('priya');
      const [work] = await seedTags(user, ['Work']);
      const message = 'Colour must be gray, red, orange, green, blue or purple.';
      expectRefusal(await patchAs(user, work?.id, { colour: 'pink' }), 'colour', message);
      expect((await storedTag(work?.id))?.colour).toBe('gray');
    });

    it('refuses a change with neither a name nor a colour, under body (AC-12, BR-3)', async () => {
      const user = await signInAs('priya');
      const [work] = await seedTags(user, ['Work']);
      for (const body of [{}, { slot: 3 }, { ownerId: user.id }]) {
        expectRefusal(await patchAs(user, work?.id, body), 'body', 'Provide a name or a colour.');
      }
      expect((await storedTag(work?.id))?.updatedAt).toEqual(new Date('2026-03-01T09:00:00.000Z'));
    });
  });

  describe('delete (AC-4, AC-8, AC-17, AC-18)', () => {
    it('answers 204 with no body and removes the tag, keeping every task (AC-4)', async () => {
      const user = await signInAs('priya');
      const mixed = await seedMixed(user);
      const res = await deleteAs(user, mixed.work).expect(204);
      expect(res.text).toBe('');
      expect(res.headers['content-type']).toBeUndefined();
      expect(await storedTag(mixed.work)).toBeNull();
      expect(await Task.countDocuments()).toBe(4);
    });

    it('removes the tag from every task that carried it and keeps their other tags (AC-4, AC-8)', async () => {
      const user = await signInAs('priya');
      const mixed = await seedMixed(user);
      await deleteAs(user, mixed.work).expect(204);
      const carried = async (id: string) => idsOf((await rawTask(id))?.tagIds).sort();
      expect(await carried(mixed.a)).toEqual([mixed.home, mixed.errands].sort());
      expect(await carried(mixed.b)).toEqual([]);
      expect(await carried(mixed.c)).toEqual([mixed.home]);
      expect(await rawTask(mixed.d)).not.toHaveProperty('tagIds');
    });

    it('stamps the clock on the tasks it changes and leaves every other task row alone (AC-4)', async () => {
      const user = await signInAs('priya');
      const [work, home] = await seedTags(user, ['Work', 'Home']);
      const touched = await seedTask(user, 'touched', [work?._id] as mongoose.Types.ObjectId[]);
      const other = await seedTask(user, 'other', [home?._id] as mongoose.Types.ObjectId[]);
      await deleteAs(user, work?.id).expect(204);
      expect((await rawTask(touched.id))?.updatedAt).toEqual(NOW);
      expect((await rawTask(other.id))?.updatedAt).toEqual(other.updatedAt);
    });

    it('drops the deleted tag from the list and the counts, and leaves the other tags counts alone (AC-4, AC-8)', async () => {
      const user = await signInAs('priya');
      const [work, home] = await seedTags(user, ['Work', 'Home']);
      await seedTask(user, 'a', [work?._id, home?._id] as mongoose.Types.ObjectId[]);
      await seedTask(user, 'b', [home?._id] as mongoose.Types.ObjectId[]);
      await deleteAs(user, work?.id).expect(204);
      const list = expectMatchesSchema(listTagsSuccessSchema, (await tagsAs(user)).body);
      expect(list.tags.map((t) => [t.name, t.taskCount])).toEqual([['Home', 2]]);
    });

    it('reads the count fresh after tasks were tagged, untagged and deleted in between (AC-17)', async () => {
      const user = await signInAs('priya');
      const [work] = await seedTags(user, ['Work']);
      const ids = [work?._id] as mongoose.Types.ObjectId[];
      const one = await seedTask(user, 'one', ids);
      const two = await seedTask(user, 'two', ids);
      await seedTask(user, 'three', ids);
      const count = async () => (await tagsAs(user)).body.tags[0].taskCount;
      expect(await count()).toBe(3);
      await request(app())
        .patch('/api/tasks/' + one.id)
        .set('Cookie', user.cookie)
        .send({ tagIds: [] })
        .expect(200);
      await request(app())
        .delete('/api/tasks/' + two.id)
        .set('Cookie', user.cookie)
        .expect(204);
      expect(await count()).toBe(1);
    });

    it('answers 404 for a second delete and for a rename after the delete, and frees the slot (AC-18, R-3)', async () => {
      const user = await signInAs('priya');
      await Tag.insertMany(buildTagRows(user.id, 50));
      const victim = await Tag.findOne({ ownerId: oid(user.id), slot: 7 }).lean();
      await deleteAs(user, String(victim?._id)).expect(204);
      const again = await deleteAs(user, String(victim?._id)).expect(404);
      expectMatchesSchema(tagNotFoundSchema, again.body);
      const rename = await patchAs(user, String(victim?._id), { name: 'late' }).expect(404);
      expectMatchesSchema(tagNotFoundSchema, rename.body);
      const created = await createTagAs(user, { name: 'fits again' }).expect(201);
      expect((await storedTag(created.body.tag.id))?.slot).toBe(7);
    });

    it('refuses a rename that arrives after a delete of the same tag, as not found, whichever of two renames arrives (AC-18, NFR-1)', async () => {
      const user = await signInAs('priya');
      const [tag] = await Tag.insertMany([buildTagRow(user.id, { name: 'Gone' })]);
      await deleteAs(user, tag?.id).expect(204);
      const results = await Promise.all([
        patchAs(user, tag?.id, { name: 'late' }),
        patchAs(user, tag?.id, { colour: 'red' }),
      ]);
      expect(results.map((r) => r.status)).toEqual([404, 404]);
      expect(await Tag.countDocuments()).toBe(0);
    });
  });

  describe('ids and access (AC-13 to AC-15)', () => {
    it('answers an unknown, another user and a malformed id with the identical 404, for rename and delete, whatever the body (AC-13, AC-14)', async () => {
      const user = await signInAs('priya');
      const other = await signInAs('ravi');
      const [theirs] = await seedTags(other, ['Theirs']);
      const [mine] = await seedTags(user, ['Mine']);
      const unknown = new mongoose.Types.ObjectId().toString();
      const renames = [];
      const deletes = [];
      const invalidBodies: unknown[] = [];
      for (const id of [unknown, theirs?.id, 'not-an-id', '123']) {
        const valid = await patchAs(user, String(id), { name: 'New' }).expect(404);
        // A malformed id is refused before the body is read (AC-14); a well-formed id, unknown or another
        // user's, gets the body validation first, and that 400 is the same whoever owns the id (AC-13).
        const malformed = !/^[0-9a-fA-F]{24}$/.test(String(id));
        const invalid = await patchAs(user, String(id), { name: '', colour: 'pink' }).expect(
          malformed ? 404 : 400,
        );
        if (malformed) expect(invalid.body, String(id)).toEqual(valid.body);
        else invalidBodies.push(expectMatchesSchema(updateTagValidationSchema, invalid.body));
        renames.push(valid.body);
        deletes.push((await deleteAs(user, String(id)).expect(404)).body);
      }
      for (const body of [...renames, ...deletes]) {
        expectMatchesSchema(tagNotFoundSchema, body);
        expect(body).toEqual(renames[0]);
      }
      expect(invalidBodies).toHaveLength(2);
      expect(invalidBodies[0]).toEqual(invalidBodies[1]);
      expect((await storedTag(theirs?.id))?.name).toBe('Theirs');
      expect((await storedTag(mine?.id))?.name).toBe('Mine');
      expect(await Tag.countDocuments()).toBe(2);
    });

    it('never pulls the tag out of tasks when another user asks to delete it (AC-13)', async () => {
      const user = await signInAs('priya');
      const other = await signInAs('ravi');
      const [work] = await seedTags(user, ['Work']);
      const task = await seedTask(user, 'carries', [work?._id] as mongoose.Types.ObjectId[]);
      await deleteAs(other, work?.id).expect(404);
      expect(idsOf((await rawTask(task.id))?.tagIds)).toEqual([work?.id]);
      expect(await storedTag(work?.id)).not.toBeNull();
    });

    it('refuses a rename and a delete with no session, 401, and changes nothing (AC-15)', async () => {
      const user = await signInAs('priya');
      const [work] = await seedTags(user, ['Work']);
      const rename = await request(app())
        .patch('/api/tags/' + work?.id)
        .send({ name: 'x' })
        .expect(401);
      expectMatchesSchema(unauthenticatedSchema, rename.body);
      const del = await request(app())
        .delete('/api/tags/' + work?.id)
        .expect(401);
      expectMatchesSchema(unauthenticatedSchema, del.body);
      expect((await storedTag(work?.id))?.name).toBe('Work');
    });
  });
});
