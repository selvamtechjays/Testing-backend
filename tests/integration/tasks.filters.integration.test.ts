// tier: integration
// requires: mongodb-memory-server (in-process, started by tests/integration/globalSetup.ts)
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '../../src/lib/apiError.js';
import { LIST_QUERY_SINGLE_MESSAGES } from '../../src/lib/taskSearch.js';
import { Session } from '../../src/models/Session.js';
import { Task } from '../../src/models/Task.js';
import { User } from '../../src/models/User.js';
import { listTasks } from '../../src/services/tasks.js';
import { buildTaskRow, type TaskRowOverrides } from '../support/builders.js';
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

const titles = (body: { tasks: { title: string }[] }) => body.tasks.map((t) => t.title);

async function seed(owner: TestUser, title: string, overrides: Partial<TaskRowOverrides> = {}) {
  return Task.create(buildTaskRow(owner.id, { title, ...overrides }));
}

/** A task as it was stored before due dates and priority existed: no `priority`, no `dueDate`. */
async function seedLegacy(owner: TestUser, title: string, createdAt: Date) {
  await Task.collection.insertOne({
    ownerId: new mongoose.Types.ObjectId(owner.id),
    title,
    status: 'pending',
    createdAt,
    updatedAt: createdAt,
  });
}

describe('filter and sort the task list against a real database (Task-23)', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init(), Task.init()]);
  });

  describe('due filters (AC-5)', () => {
    it('Overdue returns pending tasks due before today and never completed ones, nor today or later', async () => {
      const user = await signInAs('priya');
      await seed(user, 'late pending', { dueDate: '2026-11-10', createdAt: at(1) });
      await seed(user, 'yesterday pending', { dueDate: '2026-11-15', createdAt: at(2) });
      await seed(user, 'late completed', {
        dueDate: '2026-11-10',
        status: 'completed',
        createdAt: at(3),
      });
      await seed(user, 'due today', { dueDate: TODAY, createdAt: at(4) });
      await seed(user, 'due later', { dueDate: '2026-12-01', createdAt: at(5) });
      await seed(user, 'no date', { createdAt: at(6) });
      const res = await getAs(user, `due=overdue&today=${TODAY}`).expect(200);
      const body = expectMatchesSchema(listTasksSuccessSchema, res.body);
      expect(titles(body)).toEqual(['yesterday pending', 'late pending']);
    });

    it('Overdue combined with the Completed status returns nothing', async () => {
      const user = await signInAs('priya');
      await seed(user, 'late completed', { dueDate: '2026-11-10', status: 'completed' });
      await seed(user, 'late pending', { dueDate: '2026-11-10' });
      const res = await getAs(user, `due=overdue&status=completed&today=${TODAY}`).expect(200);
      expect(res.body.tasks).toEqual([]);
    });

    it('Today returns only tasks due exactly today, completed ones included', async () => {
      const user = await signInAs('priya');
      await seed(user, 'day before', { dueDate: '2026-11-15', createdAt: at(1) });
      await seed(user, 'today pending', { dueDate: TODAY, createdAt: at(2) });
      await seed(user, 'today completed', {
        dueDate: TODAY,
        status: 'completed',
        createdAt: at(3),
      });
      await seed(user, 'day after', { dueDate: '2026-11-17', createdAt: at(4) });
      const res = await getAs(user, `due=today&today=${TODAY}`).expect(200);
      expect(titles(res.body)).toEqual(['today completed', 'today pending']);
    });

    it('This week includes 2026-11-16 and 2026-11-22 and excludes 2026-11-15 and 2026-11-23', async () => {
      const user = await signInAs('priya');
      await seed(user, 'before', { dueDate: '2026-11-15', createdAt: at(1) });
      await seed(user, 'first day', { dueDate: '2026-11-16', createdAt: at(2) });
      await seed(user, 'middle', { dueDate: '2026-11-19', createdAt: at(3) });
      await seed(user, 'last day', { dueDate: '2026-11-22', createdAt: at(4) });
      await seed(user, 'after', { dueDate: '2026-11-23', createdAt: at(5) });
      await seed(user, 'no date', { createdAt: at(6) });
      const res = await getAs(user, `due=week&today=${TODAY}`).expect(200);
      expect(titles(res.body)).toEqual(['last day', 'middle', 'first day']);
    });

    it('This week follows the today the caller sends, across a month end', async () => {
      const user = await signInAs('priya');
      await seed(user, 'inside', { dueDate: '2027-01-03', createdAt: at(1) });
      await seed(user, 'outside', { dueDate: '2027-01-04', createdAt: at(2) });
      const res = await getAs(user, 'due=week&today=2026-12-28').expect(200);
      expect(titles(res.body)).toEqual(['inside']);
    });

    it('This week counts to the last date, not past it, when today is 9999-12-30', async () => {
      const user = await signInAs('priya');
      await seed(user, 'last day of the calendar', { dueDate: '9999-12-31', createdAt: at(1) });
      const res = await getAs(user, 'due=week&today=9999-12-30').expect(200);
      expect(titles(res.body)).toEqual(['last day of the calendar']);
    });

    it('No date returns tasks with no due date, including ones written before the field existed', async () => {
      const user = await signInAs('priya');
      await seed(user, 'dated', { dueDate: '2026-11-20', createdAt: at(1) });
      await seed(user, 'undated', { createdAt: at(2) });
      await seedLegacy(user, 'legacy', at(3));
      const res = await getAs(user, 'due=none').expect(200);
      expect(titles(res.body)).toEqual(['legacy', 'undated']);
    });
  });

  describe('a due filter needs today (AC-8)', () => {
    it('refuses overdue, today and week without today, naming fields.today', async () => {
      const user = await signInAs('priya');
      for (const due of ['overdue', 'today', 'week']) {
        const res = await getAs(user, `due=${due}`).expect(400);
        const body = expectMatchesSchema(listFilterValidationSchema, res.body);
        expect(body.error.fields, due).toEqual({
          today: "Send today's date with this due filter.",
        });
      }
    });

    it('refuses a today that is not a real date', async () => {
      const user = await signInAs('priya');
      const res = await getAs(user, 'due=overdue&today=2026-02-30').expect(400);
      const body = expectMatchesSchema(listFilterValidationSchema, res.body);
      expect(body.error.fields).toEqual({ today: 'Today must be a real date in YYYY-MM-DD form.' });
    });

    it('refuses the same request from a service caller with no today', async () => {
      const user = await signInAs('priya');
      const refused = await listTasks(user.id, { due: 'week' }).catch((err: unknown) => err);
      expect(refused).toBeInstanceOf(ApiError);
      expect((refused as ApiError).fields).toEqual({
        today: "Send today's date with this due filter.",
      });
    });
  });

  describe('sort (AC-6)', () => {
    it('sorts by due date, earliest first, undated last, ties newest first', async () => {
      const user = await signInAs('priya');
      await seed(user, 'later', { dueDate: '2026-12-01', createdAt: at(1) });
      await seed(user, 'undated old', { createdAt: at(2) });
      await seed(user, 'earliest', { dueDate: '2026-11-01', createdAt: at(3) });
      await seed(user, 'tie old', { dueDate: '2026-11-20', createdAt: at(4) });
      await seed(user, 'tie new', { dueDate: '2026-11-20', createdAt: at(5) });
      await seed(user, 'undated new', { createdAt: at(6) });
      await seedLegacy(user, 'legacy undated', at(7));
      const res = await getAs(user, 'sort=due').expect(200);
      expect(titles(res.body)).toEqual([
        'earliest',
        'tie new',
        'tie old',
        'later',
        'legacy undated',
        'undated new',
        'undated old',
      ]);
    });

    it('sorts by priority High, Medium, Low, with a missing priority as Medium and ties newest first', async () => {
      const user = await signInAs('priya');
      await seed(user, 'low', { priority: 'low', createdAt: at(1) });
      await seed(user, 'medium old', { priority: 'medium', createdAt: at(2) });
      await seed(user, 'high old', { priority: 'high', createdAt: at(3) });
      await seedLegacy(user, 'legacy as medium', at(4));
      await seed(user, 'high new', { priority: 'high', createdAt: at(5) });
      await seed(user, 'medium new', { priority: 'medium', createdAt: at(6) });
      const res = await getAs(user, 'sort=priority').expect(200);
      expect(titles(res.body)).toEqual([
        'high new',
        'high old',
        'medium new',
        'legacy as medium',
        'medium old',
        'low',
      ]);
    });

    it('breaks a tie on equal creation times by newest id first', async () => {
      const user = await signInAs('priya');
      await seed(user, 'first', { priority: 'high', createdAt: at(1) });
      await seed(user, 'second', { priority: 'high', createdAt: at(1) });
      await seed(user, 'third', { priority: 'high', createdAt: at(1) });
      const res = await getAs(user, 'sort=priority').expect(200);
      expect(titles(res.body)).toEqual(['third', 'second', 'first']);
    });

    it('keeps newest first for sort=newest and with no sort', async () => {
      const user = await signInAs('priya');
      await seed(user, 'old', { priority: 'low', dueDate: '2026-11-01', createdAt: at(1) });
      await seed(user, 'new', { priority: 'high', dueDate: '2026-12-01', createdAt: at(2) });
      for (const query of ['sort=newest', '']) {
        const res = await getAs(user, query).expect(200);
        expect(titles(res.body), query).toEqual(['new', 'old']);
      }
    });
  });

  describe('priority and status filters (AC-1, AC-7)', () => {
    it('Medium includes tasks with no stored priority, and High and Low do not', async () => {
      const user = await signInAs('priya');
      await seed(user, 'high', { priority: 'high', createdAt: at(1) });
      await seed(user, 'medium', { priority: 'medium', createdAt: at(2) });
      await seed(user, 'low', { priority: 'low', createdAt: at(3) });
      await seedLegacy(user, 'legacy', at(4));
      expect(titles((await getAs(user, 'priority=medium').expect(200)).body)).toEqual([
        'legacy',
        'medium',
      ]);
      expect(titles((await getAs(user, 'priority=high').expect(200)).body)).toEqual(['high']);
      expect(titles((await getAs(user, 'priority=low').expect(200)).body)).toEqual(['low']);
    });

    it('filters by status', async () => {
      const user = await signInAs('priya');
      await seed(user, 'open', { createdAt: at(1) });
      await seed(user, 'done', { status: 'completed', createdAt: at(2) });
      expect(titles((await getAs(user, 'status=pending').expect(200)).body)).toEqual(['open']);
      expect(titles((await getAs(user, 'status=completed').expect(200)).body)).toEqual(['done']);
    });

    it('refuses a value outside each list and a repeated key, naming the field', async () => {
      const user = await signInAs('priya');
      const cases: [string, string][] = [
        ['status=done', 'status'],
        ['priority=urgent', 'priority'],
        ['due=soon', 'due'],
        ['sort=oldest', 'sort'],
        ['status=pending&status=completed', 'status'],
        ['priority=low&priority=high', 'priority'],
      ];
      for (const [query, field] of cases) {
        const res = await getAs(user, query).expect(400);
        const body = expectMatchesSchema(listFilterValidationSchema, res.body);
        expect(Object.keys(body.error.fields), query).toEqual([field]);
        const repeated = query.split('&').length > 1;
        if (repeated && (field === 'status' || field === 'priority')) {
          expect(body.error.fields[field], query).toBe(LIST_QUERY_SINGLE_MESSAGES[field]);
        }
      }
    });

    it('reads bracket syntax as an unrelated key, so no query operator reaches the database', async () => {
      const user = await signInAs('priya');
      await seed(user, 'open', { createdAt: at(1) });
      await seed(user, 'done', { status: 'completed', createdAt: at(2) });
      for (const query of ['status[$ne]=pending', 'priority[$ne]=low', 'sort[$ne]=due']) {
        const res = await getAs(user, query).expect(200);
        expect(titles(res.body), query).toEqual(['done', 'open']);
      }
    });
  });

  describe('combining filters, and other users (AC-7)', () => {
    it('combines status, priority, due, sort and search, and every one narrows the result', async () => {
      const user = await signInAs('priya');
      await seed(user, 'Pay rent', { priority: 'high', dueDate: '2026-11-18', createdAt: at(2) });
      await seed(user, 'Pay tax', { priority: 'high', dueDate: '2026-11-17', createdAt: at(1) });
      await seed(user, 'Pay gym', { priority: 'low', dueDate: '2026-11-18', createdAt: at(3) });
      await seed(user, 'Pay done', {
        priority: 'high',
        dueDate: '2026-11-18',
        status: 'completed',
        createdAt: at(4),
      });
      await seed(user, 'Pay later', { priority: 'high', dueDate: '2026-12-30', createdAt: at(5) });
      await seed(user, 'Buy milk', { priority: 'high', dueDate: '2026-11-18', createdAt: at(6) });
      const query = `search=pay&status=pending&priority=high&due=week&sort=due&today=${TODAY}`;
      const res = await getAs(user, query).expect(200);
      expect(titles(res.body)).toEqual(['Pay tax', 'Pay rent']);
    });

    it('never returns another user tasks under any filter, sort or search', async () => {
      const priya = await signInAs('priya');
      const arjun = await signInAs('arjun');
      await seed(priya, 'Priya task', { priority: 'high', dueDate: '2026-11-10' });
      await seed(arjun, 'Arjun late', { priority: 'high', dueDate: '2026-11-01' });
      await seed(arjun, 'Arjun undated', { priority: 'medium' });
      await seedLegacy(arjun, 'Arjun legacy', at(9));
      const queries = [
        '',
        `due=overdue&today=${TODAY}`,
        `due=week&today=${TODAY}`,
        'due=none',
        'priority=high',
        'priority=medium',
        'sort=due',
        'sort=priority',
        `sort=priority&status=pending&search=a&today=${TODAY}`,
      ];
      for (const query of queries) {
        const res = await getAs(priya, query).expect(200);
        for (const title of titles(res.body)) expect(title, query).not.toMatch(/^Arjun/);
      }
      const asArjun = await getAs(arjun, `due=overdue&today=${TODAY}`).expect(200);
      expect(titles(asArjun.body)).toEqual(['Arjun late']);
    });

    it('refuses the filtered list without a session', async () => {
      await request(app()).get(`/api/tasks?due=overdue&today=${TODAY}`).expect(401);
    });
  });

  describe('overdue count (AC-13, DEC-212)', () => {
    it('counts the signed-in user pending tasks due before today, ignoring filters and search', async () => {
      const user = await signInAs('priya');
      const other = await signInAs('arjun');
      await seed(user, 'late high', { dueDate: '2026-11-10', priority: 'high', createdAt: at(1) });
      await seed(user, 'late low', { dueDate: '2026-11-01', priority: 'low', createdAt: at(2) });
      await seed(user, 'late done', { dueDate: '2026-11-10', status: 'completed' });
      await seed(user, 'due today', { dueDate: TODAY });
      await seed(user, 'undated');
      await seed(other, 'other late', { dueDate: '2026-11-10' });
      for (const query of [
        '',
        'due=none',
        'priority=high',
        'status=completed',
        'search=zebra',
        'due=week',
      ]) {
        const res = await getAs(user, `${query}&today=${TODAY}`).expect(200);
        const body = expectMatchesSchema(listTasksSuccessSchema, res.body);
        expect(body.overdueCount, query).toBe(2);
      }
    });

    it('is 0, not missing, when nothing is overdue and today was sent', async () => {
      const user = await signInAs('priya');
      const res = await getAs(user, `today=${TODAY}`).expect(200);
      expect(res.body).toEqual({ tasks: [], overdueCount: 0 });
    });

    it('is left out when today was not sent', async () => {
      const user = await signInAs('priya');
      await seed(user, 'late', { dueDate: '2026-11-10' });
      const res = await getAs(user, '').expect(200);
      expect(res.body).not.toHaveProperty('overdueCount');
      expect(res.body.tasks).toHaveLength(1);
    });

    it('moves with the today the caller sends, not the server clock', async () => {
      const user = await signInAs('priya');
      await seed(user, 'boundary', { dueDate: '2026-11-16' });
      expect((await getAs(user, 'today=2026-11-16').expect(200)).body.overdueCount).toBe(0);
      expect((await getAs(user, 'today=2026-11-17').expect(200)).body.overdueCount).toBe(1);
    });
  });
});
