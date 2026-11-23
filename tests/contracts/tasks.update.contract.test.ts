// tier: contract
// requires: nothing (the guard refuses before any database access; no DB, no network)
import request from 'supertest';
import { describe, it } from 'vitest';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';
import { unauthenticatedSchema } from '../support/authSchemas.js';

describe('contract: PATCH /api/tasks/:id (EP-TASK-03)', () => {
  it('refuses a caller with no session using the 401 envelope', async () => {
    const res = await request(createTestApp())
      .patch('/api/tasks/0123456789abcdef01234567')
      .send({ status: 'completed' })
      .expect(401);
    expectMatchesSchema(unauthenticatedSchema, res.body);
  });
});

describe('contract: PATCH /api/tasks/:id with a due date and priority (EP-TASK-03, Task-23)', () => {
  it('refuses a caller with no session using the 401 envelope, before reading the body', async () => {
    for (const body of [{ dueDate: null }, { dueDate: '2026-02-30' }, { priority: 'urgent' }]) {
      const res = await request(createTestApp())
        .patch('/api/tasks/0123456789abcdef01234567')
        .send(body)
        .expect(401);
      expectMatchesSchema(unauthenticatedSchema, res.body);
    }
  });
});

describe('contract: PATCH /api/tasks/:id with notes (EP-TASK-03, Task-24)', () => {
  it('refuses a caller with no session using the 401 envelope, even with notes in the body', async () => {
    for (const body of [{ notes: null }, { notes: 'x'.repeat(1001) }, { notes: 42 }]) {
      const res = await request(createTestApp())
        .patch('/api/tasks/0123456789abcdef01234567')
        .send(body)
        .expect(401);
      expectMatchesSchema(unauthenticatedSchema, res.body);
    }
  });
});

describe('contract: PATCH /api/tasks/:id with tag ids (EP-TASK-03, Task-29)', () => {
  it('refuses a caller with no session using the 401 envelope, even with tag ids in the body', async () => {
    const good = '0123456789abcdef01234567';
    for (const body of [{ tagIds: [good] }, { tagIds: [] }, { tagIds: ['nope'] }, { tagIds: 5 }]) {
      const res = await request(createTestApp())
        .patch('/api/tasks/0123456789abcdef01234567')
        .send(body)
        .expect(401);
      expectMatchesSchema(unauthenticatedSchema, res.body);
    }
  });
});
