// tier: contract
// requires: nothing (the guard refuses before any database access; no DB, no network)
import request from 'supertest';
import { describe, it } from 'vitest';
import { expectMatchesSchema } from '../support/contract.js';
import { createTestApp } from '../support/createTestApp.js';
import { unauthenticatedSchema } from '../support/authSchemas.js';

describe('contract: GET /api/tasks (EP-TASK-01)', () => {
  it('refuses a caller with no session using the 401 envelope', async () => {
    const res = await request(createTestApp()).get('/api/tasks').expect(401);
    expectMatchesSchema(unauthenticatedSchema, res.body);
  });
});

describe('contract: GET /api/tasks?search= (EP-TASK-01)', () => {
  it('refuses a caller with no session using the 401 envelope, whatever the search is', async () => {
    for (const query of ['search=milk', 'search=', `search=${'x'.repeat(101)}`]) {
      const res = await request(createTestApp()).get(`/api/tasks?${query}`).expect(401);
      expectMatchesSchema(unauthenticatedSchema, res.body);
    }
  });
});

describe('contract: POST /api/tasks (EP-TASK-02)', () => {
  it('refuses a caller with no session using the 401 envelope', async () => {
    const res = await request(createTestApp())
      .post('/api/tasks')
      .send({ title: 'No session' })
      .expect(401);
    expectMatchesSchema(unauthenticatedSchema, res.body);
  });
});

describe('contract: GET /api/tasks filters (EP-TASK-01, Task-23)', () => {
  it('refuses a caller with no session using the 401 envelope, whatever the filters are', async () => {
    const queries = [
      'status=pending&priority=high&due=week&sort=due&today=2026-11-16',
      'due=overdue',
      'status=nonsense',
    ];
    for (const query of queries) {
      const res = await request(createTestApp()).get(`/api/tasks?${query}`).expect(401);
      expectMatchesSchema(unauthenticatedSchema, res.body);
    }
  });
});

describe('contract: POST /api/tasks with a due date and priority (EP-TASK-02, Task-23)', () => {
  it('refuses a caller with no session using the 401 envelope, before reading the body', async () => {
    const res = await request(createTestApp())
      .post('/api/tasks')
      .send({ title: 'x', dueDate: '2026-02-30', priority: 'urgent' })
      .expect(401);
    expectMatchesSchema(unauthenticatedSchema, res.body);
  });
});

describe('contract: POST /api/tasks with notes (EP-TASK-02, Task-24)', () => {
  it('refuses a caller with no session using the 401 envelope, even with notes in the body', async () => {
    const res = await request(createTestApp())
      .post('/api/tasks')
      .send({ title: 'x', notes: 'x'.repeat(1001) })
      .expect(401);
    expectMatchesSchema(unauthenticatedSchema, res.body);
  });
});
