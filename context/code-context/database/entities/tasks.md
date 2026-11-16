---
doc_type: entity
schema_version: 1.1
produced_by: tl
entity_id: ENT-TASK-01
status: Active
implementation_state: Implemented
origin: implemented
generated_at: 2026-11-06
design_confidence: Confirmed
implemented_at: 2026-11-16T07:40:00Z
implemented_by_commit: d7158d3e82c56b07b40fb445062ff22a4c482e69
implemented_by_task: TASK-DUE-DATES-PRIORITY-FILTERS
mapped_from: src/models/Task.ts
mapped_from_line: 48
mapped_from_commit: d7158d3e82c56b07b40fb445062ff22a4c482e69
---

# Entity: tasks

## Entity ID

ENT-TASK-01

## Status

Active

## Kind

Collection (Mongoose model `Task`)

## Source Data Entity

DATA-004 Task (shared-context/data.md): title, status, created_at, owner, plus an optional due date and a priority (Task-23, DEC-215). One shared Task entity for all task features. There is no `lists` collection: DATA-003 List was removed (DEC-042) and the user's one personal list is implicit (BR-002).

## Purpose

Stores each user's tasks. The user's list is `tasks where ownerId = user`.

## Columns / Fields

| Name      | Type     | Constraints                                           | Notes                                                                                                                                                       | Confidence                           |
| --------- | -------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| _id       | ObjectId | PK                                                    | exposed as `id`                                                                                                                                             | Assumed                              |
| ownerId   | ObjectId | required, ref users, indexed                          | privacy boundary (BR-025)                                                                                                                                   | Confirmed (DATA-004 owner)           |
| title     | string   | required, 1 to 200 chars after trim                   | BR-016                                                                                                                                                      | Confirmed                            |
| status    | enum     | required, default `pending`; `pending` / `completed`  |                                                                                                                                                             | Confirmed (BR-008, BR-016)           |
| dueDate   | string   | optional, `YYYY-MM-DD`; absent when the task has none | a calendar date, never a Date, so it cannot shift with a time zone (DEC-214); cleared with `$unset`                                                         | Confirmed (Task-23 AC-2, AC-3, AC-9) |
| priority  | enum     | `low` / `medium` / `high`, default `medium`           | rows written before this field existed lack it; every reader maps a missing value to `medium` (DEC-210), because `.lean()` and aggregation skip the default | Confirmed (Task-23 AC-1)             |
| createdAt | Date     | required, default now                                 | ordering key (BR-026)                                                                                                                                       | Confirmed                            |
| updatedAt | Date     | required                                              | Mongoose timestamps                                                                                                                                         | Assumed                              |

## Keys & Indexes

- PK: `_id`
- Compound index: `{ ownerId: 1, createdAt: -1 }` (list newest first per user). No index was added for `dueDate` or `priority`: every list narrows to one owner first (DEC-216).
- Migration: none. Existing rows are not rewritten (DEC-210); dual-read of a missing `priority` and `dueDate` is permanent.

## Relationships

- N—1 users (ENT-AUTH-01)

## Used by Endpoints

- EP-TASK-01 GET /api/tasks — ../../backend/domains/task/endpoints/list-tasks.md
- EP-TASK-02 POST /api/tasks — ../../backend/domains/task/endpoints/create-task.md
- EP-TASK-03 PATCH /api/tasks/:id — ../../backend/domains/task/endpoints/update-task.md
- EP-TASK-04 DELETE /api/tasks/:id — ../../backend/domains/task/endpoints/delete-task.md

## Used by Features

- FEAT-TASK-01 Task List and Add Task
- FEAT-TASK-02 Edit and Complete Task
- FEAT-TASK-03 Delete Task with Undo
- FEAT-PLAT-01 Instant Update with Rollback
- FEAT-PLAT-03 Hosting and Backups (backed-up user data: tasks; no endpoint)

## Data Classification / Retention

- Personal data. Completed tasks never auto-deleted (BR-008); deletion is a hard delete (BR-010). Backup: interim daily, kept 7 days (ASM-022).

## Open Questions

- None new.

## Source References

- Feature: FEAT-TASK-01, FEAT-TASK-02, FEAT-TASK-03, FEAT-PLAT-01, FEAT-PLAT-03
- Data register: DATA-004
- Business rules: BR-002, BR-008, BR-010, BR-016, BR-025, BR-026
- Code: src/models/Task.ts:48
- Test: tests/integration/tasks.list-and-add.integration.test.ts
- Code: src/services/tasks.ts:199
- Test: tests/integration/tasks.update.integration.test.ts
- Code: src/services/tasks.ts:221
- Task: Task-23 Due dates, priority, and list filters (DEC-210, DEC-214, DEC-215, DEC-216)
- Code: src/models/Task.ts:26
- Test: tests/integration/tasks.filters.integration.test.ts
- Test: tests/integration/tasks.delete.integration.test.ts
