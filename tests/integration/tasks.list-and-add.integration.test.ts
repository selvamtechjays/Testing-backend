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
  searchValidationSchema,
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

  // Task-23 supersedes the old "no due date or priority" rule (DEC-215): those two are now stored. Task-24
  // supersedes "notes are stripped" for `notes` only (DEC-240); other unknown keys such as description still are.
  it('stores no description: only title, status, owner, times, due date and priority when no notes are sent (AC-8, BR-1, DEC-215)', async () => {
    const user = await signInAs('priya');
    const res = await addAs(user, {
      title: 'Just a title',
      description: 'd',
      dueDate: '2026-04-01',
      priority: 'high',
    }).expect(201);
    expect(Object.keys(res.body.task).sort()).toEqual(
      ['createdAt', 'dueDate', 'id', 'notes', 'priority', 'status', 'tags', 'title'].sort(),
    );
    expect(res.body.task.notes).toBeNull();
    const raw = await Task.collection.findOne({
      _id: new mongoose.Types.ObjectId(res.body.task.id),
    });
    expect(Object.keys(raw ?? {}).sort()).toEqual(
      [
        '__v',
        '_id',
        'createdAt',
        'dueDate',
        'ownerId',
        'priority',
        'status',
        'title',
        'updatedAt',
      ].sort(),
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

describe('search tasks by title against a real database (Task-22, DEC-208)', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init(), Task.init()]);
  });

  const searchAs = (user: TestUser, query: string) =>
    request(app()).get(`/api/tasks?${query}`).set('Cookie', user.cookie);
  const titles = (body: { tasks: { title: string }[] }) => body.tasks.map((t) => t.title);

  async function seedMilkAndRent(user: TestUser) {
    await seedTask(user, 'Pay rent', new Date('2026-03-01T09:00:00.000Z'));
    await seedTask(user, 'Buy milk', new Date('2026-03-01T09:30:00.000Z'));
  }

  it('returns the tasks whose title contains the text and not the others (AC-1)', async () => {
    const user = await signInAs('priya');
    await seedMilkAndRent(user);
    const res = await searchAs(user, 'search=milk').expect(200);
    const body = expectMatchesSchema(listTasksSuccessSchema, res.body);
    expect(titles(body)).toEqual(['Buy milk']);
  });

  it('matches a substring anywhere in the title and keeps newest first (AC-1)', async () => {
    const user = await signInAs('priya');
    await seedTask(user, 'milkshake order', new Date('2026-03-01T09:00:00.000Z'));
    await seedTask(user, 'Pay rent', new Date('2026-03-01T09:15:00.000Z'));
    await seedTask(user, 'Buy MILK and eggs', new Date('2026-03-01T09:30:00.000Z'));
    const res = await searchAs(user, 'search=ilk').expect(200);
    expect(titles(res.body)).toEqual(['Buy MILK and eggs', 'milkshake order']);
  });

  it('ignores capitals in the search text and in the title (AC-2)', async () => {
    const user = await signInAs('priya');
    await seedMilkAndRent(user);
    for (const query of ['search=MILK', 'search=Milk', 'search=mIlK']) {
      const res = await searchAs(user, query).expect(200);
      expect(titles(res.body)).toEqual(['Buy milk']);
    }
  });

  it('trims the search text before matching (AC-1)', async () => {
    const user = await signInAs('priya');
    await seedMilkAndRent(user);
    const res = await searchAs(user, `search=${encodeURIComponent('  milk  ')}`).expect(200);
    expect(titles(res.body)).toEqual(['Buy milk']);
  });

  it('returns an empty list when nothing matches (AC-7)', async () => {
    const user = await signInAs('priya');
    await seedMilkAndRent(user);
    const res = await searchAs(user, 'search=zebra').expect(200);
    expect(expectMatchesSchema(listTasksSuccessSchema, res.body).tasks).toEqual([]);
  });

  it('returns the full list for a missing, empty or whitespace-only search (AC-3)', async () => {
    const user = await signInAs('priya');
    await seedMilkAndRent(user);
    for (const query of ['', 'search', 'search=', `search=${encodeURIComponent('   ')}`]) {
      const res = await searchAs(user, query).expect(200);
      expect(titles(res.body)).toEqual(['Buy milk', 'Pay rent']);
    }
  });

  it('ignores other query keys (EP-TASK-01 invariants)', async () => {
    const user = await signInAs('priya');
    await seedMilkAndRent(user);
    const res = await searchAs(user, 'page=2&ownerId=abc').expect(200);
    expect(titles(res.body)).toEqual(['Buy milk', 'Pay rent']);
  });

  it('accepts search text of exactly 100 characters (AC-4)', async () => {
    const user = await signInAs('priya');
    const long = 'x'.repeat(100);
    await seedTask(user, `${long} tail`, new Date('2026-03-01T09:00:00.000Z'));
    const res = await searchAs(user, `search=${long}`).expect(200);
    expect(titles(res.body)).toEqual([`${long} tail`]);
  });

  it('refuses search text of 101 characters with a validation error naming the limit (AC-4)', async () => {
    const user = await signInAs('priya');
    const res = await searchAs(user, `search=${'x'.repeat(101)}`).expect(400);
    const body = expectMatchesSchema(searchValidationSchema, res.body);
    expect(body.error.fields.search).toBe('Search text can be at most 100 characters.');
  });

  it('counts the 100-character limit after the trim (AC-4)', async () => {
    const user = await signInAs('priya');
    await searchAs(user, `search=${encodeURIComponent(`  ${'x'.repeat(100)}  `)}`).expect(200);
  });

  it('refuses a repeated search key with the single-value message', async () => {
    const user = await signInAs('priya');
    const res = await searchAs(user, 'search=a&search=b').expect(400);
    const body = expectMatchesSchema(searchValidationSchema, res.body);
    expect(body.error.fields.search).toBe('Search text must be a single value.');
  });

  it('reads bracket syntax as an unrelated key, so no query operator reaches the database', async () => {
    const user = await signInAs('priya');
    const other = await signInAs('arjun');
    await seedMilkAndRent(user);
    await seedTask(other, 'Arjun secret', new Date('2026-03-01T10:00:00.000Z'));
    for (const query of ['search[$ne]=x', 'search[$regex]=.*', 'search[$exists]=true']) {
      const res = await searchAs(user, query).expect(200);
      expect(titles(res.body), query).toEqual(['Buy milk', 'Pay rent']);
    }
  });

  it('matches regex metacharacters literally and never runs the text as a pattern (R-1)', async () => {
    const user = await signInAs('priya');
    await seedTask(user, 'Call a.c about (draft)', new Date('2026-03-01T09:00:00.000Z'));
    await seedTask(user, 'abc budget', new Date('2026-03-01T09:10:00.000Z'));
    await seedTask(user, 'Cost is $5 + tax [urgent]', new Date('2026-03-01T09:20:00.000Z'));
    await seedTask(user, 'Done\\later', new Date('2026-03-01T09:30:00.000Z'));
    const cases: [string, string[]][] = [
      ['a.c', ['Call a.c about (draft)']],
      ['.*', []],
      ['^abc', []],
      ['(draft)', ['Call a.c about (draft)']],
      ['$5 + tax [urgent]', ['Cost is $5 + tax [urgent]']],
      ['\\', ['Done\\later']],
    ];
    for (const [text, expected] of cases) {
      const res = await searchAs(user, `search=${encodeURIComponent(text)}`).expect(200);
      expect(titles(res.body), `search for ${text}`).toEqual(expected);
    }
  });

  it('treats text that is not a valid pattern as plain text rather than failing (R-1)', async () => {
    const user = await signInAs('priya');
    await seedTask(user, 'Plain task', new Date('2026-03-01T09:00:00.000Z'));
    const res = await searchAs(user, `search=${encodeURIComponent('(unclosed[')}`).expect(200);
    expect(res.body.tasks).toEqual([]);
  });

  it('never returns another user tasks, whatever the search text is (AC-5, R-3)', async () => {
    const priya = await signInAs('priya');
    const arjun = await signInAs('arjun');
    await seedTask(priya, 'Buy milk', new Date('2026-03-01T09:00:00.000Z'));
    await seedTask(arjun, 'Buy milk for Arjun', new Date('2026-03-01T09:10:00.000Z'));
    await seedTask(arjun, 'Arjun secret', new Date('2026-03-01T09:20:00.000Z'));
    const asPriya = await searchAs(priya, 'search=milk').expect(200);
    expect(titles(asPriya.body)).toEqual(['Buy milk']);
    const asArjun = await searchAs(arjun, 'search=milk').expect(200);
    expect(titles(asArjun.body)).toEqual(['Buy milk for Arjun']);
    for (const text of ['secret', '.*', 'a', '']) {
      const res = await searchAs(priya, `search=${encodeURIComponent(text)}`).expect(200);
      expect(titles(res.body), `priya search for "${text}"`).not.toContain('Arjun secret');
      expect(titles(res.body), `priya search for "${text}"`).not.toContain('Buy milk for Arjun');
    }
  });

  it('includes completed tasks in search results', async () => {
    const user = await signInAs('priya');
    await seedTask(user, 'Buy milk', new Date('2026-03-01T09:00:00.000Z'), 'completed');
    const res = await searchAs(user, 'search=milk').expect(200);
    expect(res.body.tasks.map((t: { status: string }) => t.status)).toEqual(['completed']);
  });

  it('refuses a search without a session (AC-5)', async () => {
    await request(app()).get('/api/tasks?search=milk').expect(401);
  });
});

describe('due date and priority on add and list (Task-23)', () => {
  beforeAll(async () => {
    await Promise.all([User.init(), Session.init(), Task.init()]);
  });

  const rawTask = (id: string) => Task.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });

  it('stores a task added with no due date and no priority as Medium with no due date (AC-1)', async () => {
    const user = await signInAs('priya');
    const res = await addAs(user, { title: 'Plain' }).expect(201);
    const { task } = expectMatchesSchema(createTaskSuccessSchema, res.body);
    expect([task.dueDate, task.priority]).toEqual([null, 'medium']);
    const raw = await rawTask(task.id);
    expect(raw?.priority).toBe('medium');
    expect(raw).not.toHaveProperty('dueDate');
  });

  it('treats a null due date as no due date (AC-1)', async () => {
    const user = await signInAs('priya');
    const res = await addAs(user, { title: 'Null date', dueDate: null }).expect(201);
    expect(res.body.task.dueDate).toBeNull();
    expect(await rawTask(res.body.task.id)).not.toHaveProperty('dueDate');
  });

  it('shows a task written before these fields existed as Medium with no due date (AC-1, DEC-210)', async () => {
    const user = await signInAs('priya');
    const legacy = await Task.collection.insertOne({
      ownerId: new mongoose.Types.ObjectId(user.id),
      title: 'Written before due dates',
      status: 'pending',
      createdAt: new Date('2026-03-01T09:00:00.000Z'),
      updatedAt: new Date('2026-03-01T09:00:00.000Z'),
    });
    const raw = await rawTask(legacy.insertedId.toString());
    expect(raw).not.toHaveProperty('priority');
    expect(raw).not.toHaveProperty('dueDate');
    const res = await listAs(user).expect(200);
    const { tasks } = expectMatchesSchema(listTasksSuccessSchema, res.body);
    expect(tasks.map((t) => [t.title, t.dueDate, t.priority])).toEqual([
      ['Written before due dates', null, 'medium'],
    ]);
  });

  it('returns exactly the due date and priority it was given, and keeps them on the next read (AC-2)', async () => {
    const user = await signInAs('priya');
    const res = await addAs(user, {
      title: 'Pay rent',
      dueDate: '2026-11-20',
      priority: 'high',
    }).expect(201);
    const { task } = expectMatchesSchema(createTaskSuccessSchema, res.body);
    expect([task.dueDate, task.priority]).toEqual(['2026-11-20', 'high']);
    const list = await listAs(user).expect(200);
    expect([list.body.tasks[0].dueDate, list.body.tasks[0].priority]).toEqual([
      '2026-11-20',
      'high',
    ]);
  });

  it('stores the due date as the plain string it was sent, so it cannot shift (AC-9, R-1)', async () => {
    const west = await signInAs('priya');
    const east = await signInAs('arjun');
    for (const user of [west, east]) {
      const res = await addAs(user, { title: 'Same day', dueDate: '2026-11-20' }).expect(201);
      expect(res.body.task.dueDate).toBe('2026-11-20');
      expect((await rawTask(res.body.task.id))?.dueDate).toBe('2026-11-20');
      const list = await listAs(user).expect(200);
      expect(list.body.tasks[0].dueDate).toBe('2026-11-20');
    }
  });

  it('accepts a past due date', async () => {
    const user = await signInAs('priya');
    const res = await addAs(user, { title: 'Late', dueDate: '2020-01-01' }).expect(201);
    expect(res.body.task.dueDate).toBe('2020-01-01');
  });

  it('refuses a date that is not real, "urgent" and 6 years ahead, naming the field (AC-4)', async () => {
    const user = await signInAs('priya');
    const notReal = 'Due date must be a real date in YYYY-MM-DD form.';
    const cases: [object, string, string][] = [
      [{ dueDate: '2026-02-30' }, 'dueDate', notReal],
      [{ dueDate: 'tomorrow' }, 'dueDate', notReal],
      [{ dueDate: 20261120 }, 'dueDate', notReal],
      [{ priority: 'urgent' }, 'priority', 'Priority must be low, medium or high.'],
      [{ dueDate: '2032-03-02' }, 'dueDate', 'Due date can be at most 5 years ahead.'],
    ];
    for (const [extra, field, message] of cases) {
      const res = await addAs(user, { title: 'Refused', ...extra }).expect(400);
      const body = expectMatchesSchema(createTaskValidationSchema, res.body);
      expect(body.error.fields, JSON.stringify(extra)).toEqual({ [field]: message });
    }
    expect(await Task.countDocuments()).toBe(0);
  });

  it('accepts the last allowed due date and refuses the day after, from the server UTC date (AC-4, DEC-211)', async () => {
    const user = await signInAs('priya');
    // The clock is 2026-03-01 UTC, so the limit is 2031-03-02.
    await addAs(user, { title: 'Edge', dueDate: '2031-03-02' }).expect(201);
    const refused = await addAs(user, { title: 'Past the edge', dueDate: '2031-03-03' }).expect(
      400,
    );
    expect(expectMatchesSchema(createTaskValidationSchema, refused.body).error.fields).toEqual({
      dueDate: 'Due date can be at most 5 years ahead.',
    });
  });

  it('reports title, due date and priority problems together, in that order', async () => {
    const user = await signInAs('priya');
    const res = await addAs(user, { title: '', dueDate: 'x', priority: 'y' }).expect(400);
    const { fields } = expectMatchesSchema(createTaskValidationSchema, res.body).error;
    expect(Object.keys(fields)).toEqual(['title', 'dueDate', 'priority']);
  });
});
