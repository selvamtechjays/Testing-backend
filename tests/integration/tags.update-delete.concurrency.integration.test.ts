// tier: concurrency
// requires: mongodb-memory-server (in-process, started by tests/integration/globalSetup.ts)
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../../src/models/Session.js';
import { Tag } from '../../src/models/Tag.js';
import { Task } from '../../src/models/Task.js';
import { User } from '../../src/models/User.js';
import { buildTagRow } from '../support/builders.js';
import { createTestApp } from '../support/createTestApp.js';
import { SIGN_IN_TIME, signInAs, type TestUser } from '../support/signIn.js';

const NOW = new Date(SIGN_IN_TIME.getTime() + 60_000);
const app = createTestApp({ clock: () => NOW });

const patchAs = (user: TestUser, id: string, body: object) =>
  request(app)
    .patch('/api/tags/' + id)
    .set('Cookie', user.cookie)
    .send(body);
const deleteAs = (user: TestUser, id: string) =>
  request(app)
    .delete('/api/tags/' + id)
    .set('Cookie', user.cookie);

const DUPLICATE = 'You already have a tag with that name.';

describe('simultaneous tag renames and deletes against a real database (Task-33, R-12)', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init(), Task.init(), Tag.init()]);
  });

  it('accepts exactly one of two renames to the same name sent together, and refuses the other as a duplicate (AC-9, NFR concurrency)', async () => {
    const user = await signInAs('priya');
    for (let round = 0; round < 5; round += 1) {
      const [a, b] = await Tag.insertMany([
        buildTagRow(user.id, { name: `a${round}`, slot: round * 2 }),
        buildTagRow(user.id, { name: `b${round}`, slot: round * 2 + 1 }),
      ]);
      const results = await Promise.all([
        patchAs(user, a?.id, { name: `Same${round}` }),
        patchAs(user, b?.id, { name: `SAME${round}` }),
      ]);
      expect(results.map((r) => r.status).sort(), `round ${round}`).toEqual([200, 400]);
      expect(results.find((r) => r.status === 400)?.body.error.fields).toEqual({ name: DUPLICATE });
      const names = (await Tag.find({ _id: { $in: [a?._id, b?._id] } }).lean()).map((t) =>
        t.name.toLowerCase(),
      );
      expect(names.filter((n) => n === `same${round}`)).toHaveLength(1);
    }
  });

  it('leaves a consistent result when a rename and a delete of one tag race: no tag, or a renamed one (AC-18)', async () => {
    const user = await signInAs('priya');
    for (let round = 0; round < 5; round += 1) {
      const [tag] = await Tag.insertMany([
        buildTagRow(user.id, { name: `r${round}`, slot: round }),
      ]);
      const results = await Promise.all([
        patchAs(user, tag?.id, { name: `Renamed${round}` }),
        deleteAs(user, tag?.id),
      ]);
      const statuses = results.map((r) => r.status);
      expect(statuses[1], `round ${round}`).toBe(204);
      expect([200, 404], `round ${round}`).toContain(statuses[0]);
      expect(await Tag.findById(tag?.id), `round ${round}`).toBeNull();
    }
  });
});
