// tier: concurrency
// requires: mongodb-memory-server (in-process, started by tests/integration/globalSetup.ts)
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../../src/models/Session.js';
import { Tag } from '../../src/models/Tag.js';
import { User } from '../../src/models/User.js';
import { buildTagRows } from '../support/builders.js';
import { createTestApp } from '../support/createTestApp.js';
import { SIGN_IN_TIME, signInAs, type TestUser } from '../support/signIn.js';

const NOW = new Date(SIGN_IN_TIME.getTime() + 60_000);
const app = createTestApp({ clock: () => NOW });

const createAs = (user: TestUser, body: object) =>
  request(app).post('/api/tags').set('Cookie', user.cookie).send(body);

const ownedBy = (user: TestUser) => ({ ownerId: new mongoose.Types.ObjectId(user.id) });

const DUPLICATE = 'You already have a tag with that name.';
const LIMIT = 'You can have up to 50 tags.';

describe('simultaneous tag creates against a real database (Task-25, R-12)', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init(), Tag.init()]);
  });

  it('lets exactly one of "Work" and "work" succeed when sent at the same moment (AC-14, BR-2, BR-8)', async () => {
    const user = await signInAs('priya');
    for (let round = 0; round < 5; round += 1) {
      const names = [`Work${round}`, `work${round}`];
      const results = await Promise.all(names.map((name) => createAs(user, { name })));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses, `round ${round}`).toEqual([201, 400]);
      const refused = results.find((r) => r.status === 400);
      expect(refused?.body.error.fields).toEqual({ name: DUPLICATE });
    }
    expect(await Tag.countDocuments(ownedBy(user))).toBe(5);
  });

  it('keeps one tag when many creates of one name race, and every loser is a duplicate refusal (AC-14)', async () => {
    const user = await signInAs('priya');
    const results = await Promise.all(
      ['Home', 'home', 'HOME', 'hOmE', 'Home'].map((name) => createAs(user, { name })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    for (const loser of results.filter((r) => r.status !== 201)) {
      expect(loser.status).toBe(400);
      expect(loser.body.error.fields).toEqual({ name: DUPLICATE });
    }
    expect(await Tag.countDocuments(ownedBy(user))).toBe(1);
  });

  it('leaves no more than 50 tags when creates race at 49, and refuses the rest with the limit message (AC-15, BR-5, BR-8)', async () => {
    const user = await signInAs('priya');
    await Tag.insertMany(buildTagRows(user.id, 49));
    const results = await Promise.all(
      ['r1', 'r2', 'r3', 'r4', 'r5'].map((name) => createAs(user, { name })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    for (const loser of results.filter((r) => r.status !== 201)) {
      expect(loser.status).toBe(400);
      expect(loser.body.error.fields).toEqual({ name: LIMIT });
    }
    expect(await Tag.countDocuments(ownedBy(user))).toBe(50);
    const slots = (await Tag.find(ownedBy(user)).lean()).map((t) => t.slot);
    expect(new Set(slots).size).toBe(50);
  });

  it('fills distinct slots when creates of different names race below the limit (AC-15)', async () => {
    const user = await signInAs('priya');
    const names = Array.from({ length: 6 }, (_, i) => `n${i}`);
    const results = await Promise.all(names.map((name) => createAs(user, { name })));
    expect(results.map((r) => r.status)).toEqual(names.map(() => 201));
    const slots = (await Tag.find(ownedBy(user)).lean()).map((t) => t.slot);
    expect(slots).toHaveLength(6);
    expect(new Set(slots).size).toBe(6);
    expect(Math.max(...slots)).toBeLessThan(50);
  });

  it('creates every tag when more creates race than the old four-attempt bound, none refused as over the limit (AC-15)', async () => {
    const user = await signInAs('priya');
    const names = Array.from({ length: 20 }, (_, i) => `m${i}`);
    const results = await Promise.all(names.map((name) => createAs(user, { name })));
    expect(results.map((r) => r.status)).toEqual(names.map(() => 201));
    const slots = (await Tag.find(ownedBy(user)).lean()).map((t) => t.slot);
    expect(slots).toHaveLength(20);
    expect(new Set(slots).size).toBe(20);
  });
});
