---
doc_type: endpoint
schema_version: 1.1
produced_by: tl
endpoint_id: EP-TASK-02
method: POST
path: /api/tasks
match_key: 'POST /api/tasks'
status: Active
implementation_state: Implemented
origin: implemented
generated_at: 2026-11-06
design_confidence: Confirmed
implemented_at: 2026-11-07T11:05:00Z
implemented_by_commit: e58dea19ae916587d5d5e23474c436b2c285f11e
implemented_by_task: FEAT-TASK-01-1
mapped_from: src/routes/tasks.ts
mapped_from_line: 40
mapped_from_commit: e58dea19ae916587d5d5e23474c436b2c285f11e
---

# Endpoint: Create Task

## Endpoint ID

EP-TASK-02

## Status

Active

## Method + Path

POST /api/tasks

## Domain

Task

## Purpose

Add a Pending task with a title to the signed-in user's list (TASK-UC-02). Called in the background after the screen has already shown the task (instant-update behaviour, FEAT-PLAT-01).

## Trigger

Called by page(s) — see Called by.

## Request

| Field | Type   | Required | Notes                                      | Confidence         |
| ----- | ------ | -------- | ------------------------------------------ | ------------------ |
| title | string | yes      | trimmed; non-empty; at most 200 characters | Confirmed (BR-016) |

## Response

- `201 Created` → `{ task: { id, title, status: "pending", createdAt } }` (the client replaces its temporary row with the server id and createdAt)
- `400` empty or over-200 title → `{ error: { code: "VALIDATION", fields: { title } } }` (the client blocks input at 200, so this is a backstop)
- `401` no valid session
- Response shape: Assumed

## Auth

Requires a valid session; owner is taken from the session, never from the body.

## Behaviour / Business Rules

- Status is always Pending on creation (BR-016). Whitespace-only title treated as empty (Assumed).
- Only a title exists; unknown body fields are ignored/rejected (no notes, due date, priority — BR-016).
- createdAt set by the server; list order is by createdAt (BR-026).
- A failure here is surfaced to the user by rolling the optimistic row back (BR-018, FEAT-PLAT-01).

## Called by

- PAGE-TASK-01 Task List — ../../../../../../../frontend/context/code-context/frontend/pages/task/task-list.md

## Reads / Writes Entities

- Writes tasks — ../../../../database/entities/tasks.md (ENT-TASK-01)
- Reads sessions (via requireSession) — ../../../../database/entities/sessions.md (ENT-AUTH-02)

## Used by Features

- FEAT-TASK-01 Task List and Add Task
- FEAT-PLAT-01 Instant Update with Rollback

## Integrations

- None.

## Open Questions

- None.

## Source References

- Feature: FEAT-TASK-01, FEAT-PLAT-01
- Workflow: WF-002, WF-003
- Business rules: BR-016, BR-018, BR-026
- Data: DATA-004
- Code: src/routes/tasks.ts:40
- Code: src/services/tasks.ts:39
- Code: src/lib/taskTitle.ts:15
- Test: tests/integration/tasks.list-and-add.integration.test.ts
- Test: tests/unit/taskTitle.test.ts
