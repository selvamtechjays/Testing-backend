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
import { buildTagRow, buildTaskRow, type TaskRowOverrides } from '../support/builders.js';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';
import { SIGN_IN_TIME, signInAs, type TestUser } from '../support/signIn.js';
import { listFilterValidationSchema, listTasksSuccessSchema } from '../support/taskSchemas.js';

const NOW = new Date(SIGN_IN_TIME.getTime() + 60_000);
const TODAY = '2026-11-16';
const app = () => createTestApp({ clock: () => NOW });

/** Minutes after a fixed morning, so every seeded task has a distinct, known creation order. */
const at = (minute: number) => new Date(Date.UTC(2026, 2, 1, 9, minute));

const getAs = (user: TestUser, query: string) =>
  request(app()).get(`/api/tasks?${query}`).set('Cookie', user.cookie);

const titles = (res: request.Response) =>
  expectMatchesSchema(listTasksSuccessSchema, res.body).tasks.map((t) => t.title);

const TAG_REFUSAL = 'Tag must be none or one of your own tags.';

type Seed = Partial<TaskRowOverrides> & { title: string };

/**
 * The shared fixture: 10 tasks for the owner, 4 carrying Work, 3 carrying Home, and 3 with no tags (one a plain
 * new task, one a row written before tags existed with no field at all, one with an empty list).
 */
async function seedLibrary(owner: TestUser) {
  const [work, home] = await Tag.insertMany([
    buildTagRow(owner.id, { name: 'Work', slot: 0 }),
    buildTagRow(owner.id, { name: 'Home', slot: 1 }),
  ]);
  const withTag = (tag: typeof work, seed: Seed) =>
    Task.create({ ...buildTaskRow(owner.id, seed), tagIds: [tag?._id] });
  await withTag(work, {
    title: 'Work report',
    priority: 'high',
    dueDate: '2026-11-10',
    createdAt: at(1),
  });
  await withTag(work, {
    title: 'Work plan',
    priority: 'low',
    dueDate: '2026-11-18',
    createdAt: at(2),
  });
  await withTag(work, { title: 'Work done', status: 'completed', createdAt: at(3) });
  await withTag(work, { title: 'Work review', dueDate: '2026-11-20', createdAt: at(4) });
  await withTag(home, {
    title: 'Home chores',
    priority: 'high',
    dueDate: '2026-11-16',
    createdAt: at(5),
  });
  await withTag(home, { title: 'Home tidy', priority: 'low', createdAt: at(6) });
  await withTag(home, {
    title: 'Home laundry',
    status: 'completed',
    dueDate: '2026-11-12',
    createdAt: at(7),
  });
  await Task.create(buildTaskRow(owner.id, { title: 'Plain one', createdAt: at(8) }));
  const legacy = { ...buildTaskRow(owner.id, { title: 'Plain two', createdAt: at(9) }) };
  await Task.collection.insertOne(legacy);
  const empty = {
    ...buildTaskRow(owner.id, { title: 'Plain three', createdAt: at(10) }),
    tagIds: [],
  };
  await Task.collection.insertOne(empty);
  return { work: work?.id as string, home: home?.id as string };
}

describe('filter the task list by tag against a real database (Task-31, FEAT-TAG-04)', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init(), Task.init(), Tag.init()]);
  });

  describe('one tag, or none (AC-1, AC-2)', () => {
    it('returns only the tasks that carry the tag, each with its tags (AC-1)', async () => {
      const user = await signInAs('priya');
      const { work, home } = await seedLibrary(user);
      const res = await getAs(user, `tag=${work}`).expect(200);
      expect(titles(res)).toEqual(['Work review', 'Work done', 'Work plan', 'Work report']);
      for (const task of res.body.tasks) {
        expect(task.tags.map((t: { id: string }) => t.id)).toEqual([work]);
      }
      expect(titles(await getAs(user, `tag=${home}`).expect(200))).toEqual([
        'Home laundry',
        'Home tidy',
        'Home chores',
      ]);
    });

    it('returns only the tasks with no tags for none, including a row with no field and one with an empty list (AC-2)', async () => {
      const user = await signInAs('priya');
      await seedLibrary(user);
      const res = await getAs(user, 'tag=none').expect(200);
      expect(titles(res)).toEqual(['Plain three', 'Plain two', 'Plain one']);
      expect(res.body.tasks.every((t: { tags: unknown[] }) => t.tags.length === 0)).toBe(true);
    });

    it('accepts none for a user who has no tags at all, and returns every task (AC-12)', async () => {
      const user = await signInAs('priya');
      await Task.create(buildTaskRow(user.id, { title: 'Only task' }));
      expect(titles(await getAs(user, 'tag=none').expect(200))).toEqual(['Only task']);
    });
  });

  describe('combined with the other filters and every sort (AC-3, AC-9, AC-24)', () => {
    it('combines the tag with status, priority, due and search, and applies the owner filter first (AC-3)', async () => {
      const user = await signInAs('priya');
      const { work, home } = await seedLibrary(user);
      const cases: [string, string[]][] = [
        [`tag=${work}&status=pending`, ['Work review', 'Work plan', 'Work report']],
        [`tag=${work}&priority=medium`, ['Work review', 'Work done']],
        [`tag=${work}&search=plan`, ['Work plan']],
        [`tag=${work}&due=overdue&today=${TODAY}`, ['Work report']],
        [`tag=${home}&due=week&today=${TODAY}`, ['Home chores']],
        [`tag=${home}&due=none`, ['Home tidy']],
        [`tag=none&priority=medium`, ['Plain three', 'Plain two', 'Plain one']],
        [`tag=none&status=completed`, []],
      ];
      for (const [query, expected] of cases) {
        expect(titles(await getAs(user, query).expect(200)), query).toEqual(expected);
      }
    });

    it('keeps the requested order under every sort when a tag is chosen (AC-3)', async () => {
      const user = await signInAs('priya');
      const { work } = await seedLibrary(user);
      const cases: [string, string[]][] = [
        ['sort=newest', ['Work review', 'Work done', 'Work plan', 'Work report']],
        ['sort=due', ['Work report', 'Work plan', 'Work review', 'Work done']],
        ['sort=priority', ['Work report', 'Work review', 'Work done', 'Work plan']],
      ];
      for (const [sort, expected] of cases) {
        expect(titles(await getAs(user, `tag=${work}&${sort}`).expect(200)), sort).toEqual(
          expected,
        );
      }
    });

    it('applies none under the due and priority sorts too (AC-2, AC-3)', async () => {
      const user = await signInAs('priya');
      await seedLibrary(user);
      for (const sort of ['newest', 'due', 'priority']) {
        const res = await getAs(user, `tag=none&sort=${sort}`).expect(200);
        expect(titles(res).sort(), sort).toEqual(['Plain one', 'Plain three', 'Plain two']);
      }
    });

    it('leaves the overdue count alone whatever the tag is (AC-9)', async () => {
      const user = await signInAs('priya');
      const { work, home } = await seedLibrary(user);
      for (const tag of [work, home, 'none']) {
        const res = await getAs(user, `tag=${tag}&today=${TODAY}`).expect(200);
        expect(res.body.overdueCount, tag).toBe(1);
      }
      expect((await getAs(user, `today=${TODAY}`).expect(200)).body.overdueCount).toBe(1);
    });

    it('never matches a tag name in the title search (AC-24)', async () => {
      const user = await signInAs('priya');
      const { work, home } = await seedLibrary(user);
      expect(titles(await getAs(user, 'search=Work').expect(200)).sort()).toEqual([
        'Work done',
        'Work plan',
        'Work report',
        'Work review',
      ]);
      expect(titles(await getAs(user, `tag=${work}&search=Home`).expect(200))).toEqual([]);
      // A task that carries the Home tag but has no "Home" in its title is not found by searching "Home".
      await Task.create({ ...buildTaskRow(user.id, { title: 'Pay rent' }), tagIds: [home] });
      expect(titles(await getAs(user, 'search=Home').expect(200)).sort()).toEqual([
        'Home chores',
        'Home laundry',
        'Home tidy',
      ]);
      expect(titles(await getAs(user, `tag=${home}`).expect(200))).toContain('Pay rent');
    });
  });

  describe('refusals (AC-10 to AC-15)', () => {
    it('answers an unknown id, another user id and a malformed id with the identical 400 naming tag (AC-10, AC-11, AC-12)', async () => {
      const user = await signInAs('priya');
      const other = await signInAs('ravi');
      await seedLibrary(user);
      const [theirs] = await Tag.insertMany([buildTagRow(other.id, { name: 'Work', slot: 0 })]);
      const unknown = new mongoose.Types.ObjectId().toString();
      const bodies = [];
      for (const tag of [unknown, theirs?.id, 'not-an-id', '', '123']) {
        const res = await getAs(user, `tag=${tag}`).expect(400);
        const parsed = expectMatchesSchema(listFilterValidationSchema, res.body);
        expect(parsed.error.fields, String(tag)).toEqual({ tag: TAG_REFUSAL });
        bodies.push(res.body);
      }
      for (const body of bodies) expect(body).toEqual(bodies[0]);
    });

    it('refuses an id whose tag was deleted, as an unknown id (AC-10)', async () => {
      const user = await signInAs('priya');
      const { work } = await seedLibrary(user);
      await Tag.deleteOne({ _id: new mongoose.Types.ObjectId(work) });
      const res = await getAs(user, `tag=${work}`).expect(400);
      expect(res.body.error.fields).toEqual({ tag: TAG_REFUSAL });
    });

    it('refuses a repeated tag key under tag, whatever the values (AC-13)', async () => {
      const user = await signInAs('priya');
      const { work, home } = await seedLibrary(user);
      for (const query of [
        `tag=${work}&tag=${home}`,
        'tag=none&tag=none',
        `tag=${work}&tag=none`,
      ]) {
        const res = await getAs(user, query).expect(400);
        const parsed = expectMatchesSchema(listFilterValidationSchema, res.body);
        expect(parsed.error.fields, query).toEqual({ tag: 'Tag must be a single value.' });
      }
    });

    it('reports a refused tag together with another refused key (AC-10)', async () => {
      const user = await signInAs('priya');
      const res = await getAs(user, 'tag=nope&status=bogus').expect(400);
      expect(Object.keys(res.body.error.fields).sort()).toEqual(['status', 'tag']);
    });

    it('refuses a request with no session, 401, whatever the tag (AC-14)', async () => {
      for (const query of ['tag=none', 'tag=0123456789abcdef01234567', 'tag=nope']) {
        const res = await request(app()).get(`/api/tasks?${query}`).expect(401);
        expectMatchesSchema(unauthenticatedSchema, res.body);
      }
    });

    it("never returns another user's tasks, whatever tag is asked for (AC-15)", async () => {
      const user = await signInAs('priya');
      const other = await signInAs('ravi');
      const { work } = await seedLibrary(user);
      const [theirWork] = await Tag.insertMany([buildTagRow(other.id, { name: 'Work', slot: 0 })]);
      await Task.create({
        ...buildTaskRow(other.id, { title: 'Their work', createdAt: at(20) }),
        tagIds: [theirWork?._id],
      });
      await Task.create(buildTaskRow(other.id, { title: 'Their plain', createdAt: at(21) }));
      expect(titles(await getAs(user, `tag=${work}`).expect(200))).not.toContain('Their work');
      expect(titles(await getAs(user, 'tag=none').expect(200))).not.toContain('Their plain');
      expect(titles(await getAs(other, `tag=${theirWork?.id}`).expect(200))).toEqual([
        'Their work',
      ]);
    });
  });
});
