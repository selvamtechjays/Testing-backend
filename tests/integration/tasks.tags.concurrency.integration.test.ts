// tier: concurrency
// requires: mongodb-memory-server (in-process, started by tests/integration/globalSetup.ts)
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../../src/models/Session.js';
import { Tag } from '../../src/models/Tag.js';
import { Task } from '../../src/models/Task.js';
import { User } from '../../src/models/User.js';
import { buildTagRow, buildTaskRow } from '../support/builders.js';
import { createTestApp } from '../support/createTestApp.js';
import { SIGN_IN_TIME, signInAs, type TestUser } from '../support/signIn.js';

const NOW = new Date(SIGN_IN_TIME.getTime() + 60_000);
const app = createTestApp({ clock: () => NOW });

const patchAs = (user: TestUser, id: string, body: object) =>
  request(app)
    .patch('/api/tasks/' + id)
    .set('Cookie', user.cookie)
    .send(body);

describe('simultaneous tag updates against a real database (Task-29, R-12)', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init(), Task.init(), Tag.init()]);
  });

  it('leaves one whole valid list, never a merge and never more than 5, when two updates race (AC-3, AC-11, NFR concurrency)', async () => {
    const user = await signInAs('priya');
    const tags = await Tag.insertMany(
      Array.from({ length: 10 }, (_, slot) => buildTagRow(user.id, { name: `t${slot}`, slot })),
    );
    const first = tags.slice(0, 5).map((t) => t.id);
    const second = tags.slice(5, 10).map((t) => t.id);
    for (let round = 0; round < 5; round += 1) {
      const task = await Task.create(buildTaskRow(user.id, { title: `race ${round}` }));
      const results = await Promise.all([
        patchAs(user, task.id, { tagIds: first }),
        patchAs(user, task.id, { tagIds: second }),
      ]);
      expect(
        results.map((r) => r.status),
        `round ${round}`,
      ).toEqual([200, 200]);
      const stored = await Task.collection.findOne({ _id: new mongoose.Types.ObjectId(task.id) });
      const ids = ((stored?.tagIds ?? []) as mongoose.Types.ObjectId[]).map(String).sort();
      expect(ids.length, `round ${round}`).toBeLessThanOrEqual(5);
      expect([[...first].sort(), [...second].sort()], `round ${round}`).toContainEqual(ids);
    }
  });

  it('never ends with more than 5 tags when many updates of different lists race (AC-11)', async () => {
    const user = await signInAs('priya');
    const tags = await Tag.insertMany(
      Array.from({ length: 8 }, (_, slot) => buildTagRow(user.id, { name: `m${slot}`, slot })),
    );
    const task = await Task.create(buildTaskRow(user.id, { title: 'many' }));
    const lists = [0, 1, 2, 3].map((start) => tags.slice(start, start + 5).map((t) => t.id));
    const results = await Promise.all(lists.map((tagIds) => patchAs(user, task.id, { tagIds })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const stored = await Task.collection.findOne({ _id: new mongoose.Types.ObjectId(task.id) });
    const ids = ((stored?.tagIds ?? []) as mongoose.Types.ObjectId[]).map(String).sort();
    expect(lists.map((l) => [...l].sort())).toContainEqual(ids);
  });
});
