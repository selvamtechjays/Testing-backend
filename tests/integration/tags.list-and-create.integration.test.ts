// tier: integration
// requires: mongodb-memory-server (in-process, started by tests/integration/globalSetup.ts)
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../../src/models/Session.js';
import { Tag } from '../../src/models/Tag.js';
import { Task } from '../../src/models/Task.js';
import { User } from '../../src/models/User.js';
import { buildTagRow, buildTagRows, buildTaskRow } from '../support/builders.js';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';
import { SIGN_IN_TIME, signInAs, type TestUser } from '../support/signIn.js';
import {
  createTagSuccessSchema,
  createTagValidationSchema,
  listTagsSuccessSchema,
} from '../support/taskSchemas.js';
import { unauthenticatedSchema } from '../support/authSchemas.js';

const NOW = new Date(SIGN_IN_TIME.getTime() + 60_000);
const app = () => createTestApp({ clock: () => NOW });

const listAs = (user: TestUser, query = '') =>
  request(app())
    .get('/api/tags' + query)
    .set('Cookie', user.cookie);
const createAs = (user: TestUser, body: unknown) =>
  request(app())
    .post('/api/tags')
    .set('Cookie', user.cookie)
    .send(body as object);

const tagCount = (user: TestUser) =>
  Tag.countDocuments({ ownerId: new mongoose.Types.ObjectId(user.id) });

/** Asserts a 400 whose only refused field is `field`, with the shared message, and returns the message. */
function expectRefusal(res: request.Response, field: 'name' | 'colour', message: string) {
  expect(res.status).toBe(400);
  const body = expectMatchesSchema(createTagValidationSchema, res.body);
  expect(body.error.fields).toEqual({ [field]: message });
}

describe('the personal tag library against a real database (Task-25, FEAT-TAG-01)', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init(), Task.init(), Tag.init()]);
  });

  describe('create (AC-1, AC-2, AC-5, AC-6, AC-13)', () => {
    it('creates a gray tag with only a name and answers 201 with taskCount 0 (AC-1)', async () => {
      const user = await signInAs('priya');
      const res = await createAs(user, { name: 'Work' }).expect(201);
      const { tag } = expectMatchesSchema(createTagSuccessSchema, res.body);
      expect(tag).toMatchObject({ name: 'Work', colour: 'gray', taskCount: 0 });
      const stored = await Tag.findById(tag.id).lean();
      expect(stored).toMatchObject({ name: 'Work', colour: 'gray', slot: 0 });
      expect(stored?.ownerId.toString()).toBe(user.id);
      expect(stored?.createdAt).toEqual(NOW);
    });

    it('keeps an explicit colour from the six (AC-2)', async () => {
      const user = await signInAs('priya');
      for (const colour of ['gray', 'red', 'orange', 'green', 'blue', 'purple']) {
        const res = await createAs(user, { name: `c-${colour}`, colour }).expect(201);
        expect(res.body.tag.colour, colour).toBe(colour);
      }
    });

    it('accepts a 1-character name and a 30-character name (AC-5)', async () => {
      const user = await signInAs('priya');
      await createAs(user, { name: 'a' }).expect(201);
      await createAs(user, { name: 'n'.repeat(30) }).expect(201);
      expect(await tagCount(user)).toBe(2);
    });

    it('trims the ends, keeps inner spaces, and returns "Q&A" and "🏠 Home" exactly as typed (AC-6)', async () => {
      const user = await signInAs('priya');
      const names = [
        ['  Home  ', 'Home'],
        ['a  b', 'a  b'],
        ['Q&A', 'Q&A'],
        ['🏠 Home', '🏠 Home'],
      ] as const;
      for (const [sent, expected] of names) {
        const res = await createAs(user, { name: sent }).expect(201);
        expect(res.body.tag.name, sent).toBe(expected);
        expect((await Tag.findById(res.body.tag.id).lean())?.name, sent).toBe(expected);
      }
    });

    it('stores and returns a name with markup as literal text (AC-13)', async () => {
      const user = await signInAs('priya');
      const markup = '<img src=x onerror=alert(1)>';
      const res = await createAs(user, { name: markup }).expect(201);
      expect(res.body.tag.name).toBe(markup);
      const list = await listAs(user).expect(200);
      expect(list.body.tags[0].name).toBe(markup);
    });

    it('never takes the owner or the slot from the body (BR-1)', async () => {
      const user = await signInAs('priya');
      const other = await signInAs('ravi');
      const res = await createAs(user, { name: 'Mine', ownerId: other.id, slot: 9 }).expect(201);
      const stored = await Tag.findById(res.body.tag.id).lean();
      expect(stored?.ownerId.toString()).toBe(user.id);
      expect(stored?.slot).toBe(0);
      expect(await tagCount(other)).toBe(0);
    });

    it('gives a new tag the smallest free slot, reusing the slot of a deleted tag (BR-5)', async () => {
      const user = await signInAs('priya');
      for (const name of ['a', 'b', 'c']) await createAs(user, { name }).expect(201);
      await Tag.deleteOne({ ownerId: new mongoose.Types.ObjectId(user.id), slot: 1 });
      const res = await createAs(user, { name: 'd' }).expect(201);
      expect((await Tag.findById(res.body.tag.id).lean())?.slot).toBe(1);
    });
  });

  describe('list (AC-3, AC-4, AC-16)', () => {
    it('lists only the signed-in user, sorted by name ignoring case, with counts (AC-3)', async () => {
      const user = await signInAs('priya');
      const other = await signInAs('ravi');
      // Byte order would be Cherry, apple, banana; ignoring case it is apple, banana, Cherry.
      const [banana, cherry, apple] = await Tag.insertMany([
        buildTagRow(user.id, { name: 'banana', slot: 0 }),
        buildTagRow(user.id, { name: 'Cherry', slot: 1, colour: 'blue' }),
        buildTagRow(user.id, { name: 'apple', slot: 2, colour: 'red' }),
      ]);
      await Tag.create(buildTagRow(other.id, { name: 'zebra' }));
      await Task.create({ ...buildTaskRow(user.id, { title: 't1' }), tagIds: [cherry?._id] });
      await Task.create({
        ...buildTaskRow(user.id, { title: 't2' }),
        tagIds: [cherry?._id, apple?._id],
      });
      await Task.create(buildTaskRow(user.id, { title: 'untagged' }));
      const res = await listAs(user).expect(200);
      const { tags } = expectMatchesSchema(listTagsSuccessSchema, res.body);
      expect(tags.map((t) => [t.name, t.colour, t.taskCount])).toEqual([
        ['apple', 'red', 1],
        ['banana', 'gray', 0],
        ['Cherry', 'blue', 2],
      ]);
      expect(tags.map((t) => t.id)).toEqual([apple?.id, banana?.id, cherry?.id]);
    });

    it('answers an empty list for a user with no tags, and ignores query keys (AC-3)', async () => {
      const user = await signInAs('priya');
      const res = await listAs(user, '?tag=none&sort=due&x=1').expect(200);
      expect(expectMatchesSchema(listTagsSuccessSchema, res.body).tags).toEqual([]);
    });

    it('reports 0 for a tag no task carries, and counts around a task written before tags existed (AC-3)', async () => {
      const user = await signInAs('priya');
      await Tag.create(buildTagRow(user.id, { name: 'Errands' }));
      await Task.collection.insertOne({
        ownerId: new mongoose.Types.ObjectId(user.id),
        title: 'Written before tags',
        status: 'pending',
        createdAt: new Date('2026-03-01T09:00:00.000Z'),
        updatedAt: new Date('2026-03-01T09:00:00.000Z'),
      });
      const res = await listAs(user).expect(200);
      expect(res.body.tags.map((t: { taskCount: number }) => t.taskCount)).toEqual([0]);
    });

    it('lets two users each create "Work" and shows each only their own (AC-4)', async () => {
      const a = await signInAs('priya');
      const b = await signInAs('ravi');
      const fromA = await createAs(a, { name: 'Work', colour: 'red' }).expect(201);
      const fromB = await createAs(b, { name: 'Work', colour: 'blue' }).expect(201);
      expect(fromA.body.tag.id).not.toBe(fromB.body.tag.id);
      const listA = await listAs(a).expect(200);
      const listB = await listAs(b).expect(200);
      expect(listA.body.tags.map((t: { colour: string }) => t.colour)).toEqual(['red']);
      expect(listB.body.tags.map((t: { colour: string }) => t.colour)).toEqual(['blue']);
    });

    it("neither lists nor counts another user's tags, and not their tasks either (AC-16)", async () => {
      const a = await signInAs('priya');
      const b = await signInAs('ravi');
      await Tag.insertMany(buildTagRows(a.id, 50));
      expect(
        await listAs(b)
          .expect(200)
          .then((r) => r.body.tags),
      ).toEqual([]);
      const mine = await createAs(b, { name: 'Mine' }).expect(201);
      // A task of A that carries B's tag id must not count toward B's tag.
      await Task.create({
        ...buildTaskRow(a.id, { title: 'foreign' }),
        tagIds: [new mongoose.Types.ObjectId(mine.body.tag.id)],
      });
      const list = await listAs(b).expect(200);
      expect(list.body.tags.map((t: { taskCount: number }) => t.taskCount)).toEqual([0]);
      expect(await tagCount(a)).toBe(50);
    });
  });

  describe('refusals (AC-7 to AC-12)', () => {
    it('refuses a name that matches ignoring case, naming name, and creates nothing (AC-7)', async () => {
      const user = await signInAs('priya');
      await createAs(user, { name: 'Work' }).expect(201);
      const res = await createAs(user, { name: 'work' });
      expectRefusal(res, 'name', 'You already have a tag with that name.');
      expect(await tagCount(user)).toBe(1);
    });

    it('refuses "café" when "Café" exists, and names that differ by spaces stay distinct (AC-7)', async () => {
      const user = await signInAs('priya');
      await createAs(user, { name: 'Café' }).expect(201);
      expectRefusal(
        await createAs(user, { name: 'café' }),
        'name',
        'You already have a tag with that name.',
      );
      await createAs(user, { name: 'Ca fé' }).expect(201);
      expect(await tagCount(user)).toBe(2);
    });

    it('refuses an empty, whitespace-only or missing name, naming name, and creates nothing (AC-8)', async () => {
      const user = await signInAs('priya');
      const required = 'Enter a tag name.';
      const text = 'Tag name must be text.';
      const bodies: [object, string][] = [
        [{ name: '' }, required],
        [{ name: '   ' }, required],
        [{}, required],
        [{ name: null }, text],
        [{ name: 7 }, text],
      ];
      for (const [body, message] of bodies) {
        expectRefusal(await createAs(user, body), 'name', message);
      }
      expect(await tagCount(user)).toBe(0);
    });

    it('refuses 31 characters and 16 emoji, accepts 15 emoji, naming name (AC-9)', async () => {
      const user = await signInAs('priya');
      const tooLong = 'Tag names can be at most 30 characters.';
      expectRefusal(await createAs(user, { name: 'n'.repeat(31) }), 'name', tooLong);
      expectRefusal(await createAs(user, { name: '😀'.repeat(16) }), 'name', tooLong);
      await createAs(user, { name: '😀'.repeat(15) }).expect(201);
      expect(await tagCount(user)).toBe(1);
    });

    it('refuses a colour outside the six, naming colour, and creates nothing (AC-10)', async () => {
      const user = await signInAs('priya');
      const message = 'Colour must be gray, red, orange, green, blue or purple.';
      expectRefusal(await createAs(user, { name: 'x', colour: 'pink' }), 'colour', message);
      expectRefusal(await createAs(user, { name: 'x', colour: 5 }), 'colour', message);
      expect(await tagCount(user)).toBe(0);
    });

    it('refuses the 51st tag naming name, and leaves the 50 unchanged (AC-11)', async () => {
      const user = await signInAs('priya');
      await Tag.insertMany(buildTagRows(user.id, 50));
      const res = await createAs(user, { name: 'one too many' });
      expectRefusal(res, 'name', 'You can have up to 50 tags.');
      expect(await tagCount(user)).toBe(50);
    });

    it('allows a new tag once a deleted one frees its slot at the limit (AC-11, BR-5)', async () => {
      const user = await signInAs('priya');
      await Tag.insertMany(buildTagRows(user.id, 50));
      await Tag.deleteOne({ ownerId: new mongoose.Types.ObjectId(user.id), slot: 20 });
      const res = await createAs(user, { name: 'fits again' }).expect(201);
      expect((await Tag.findById(res.body.tag.id).lean())?.slot).toBe(20);
    });

    it('refuses a list and a create with no session, 401, and creates nothing (AC-12)', async () => {
      const user = await signInAs('priya');
      const list = await request(app()).get('/api/tags').expect(401);
      expectMatchesSchema(unauthenticatedSchema, list.body);
      const create = await request(app()).post('/api/tags').send({ name: 'Work' }).expect(401);
      expectMatchesSchema(unauthenticatedSchema, create.body);
      expect(await Tag.countDocuments()).toBe(0);
      expect(await tagCount(user)).toBe(0);
    });
  });
});
