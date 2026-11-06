---
doc_type: entity
schema_version: 1.1
produced_by: tl
entity_id: ENT-TASK-01
status: Proposed
implementation_state: Planned
origin: designed
generated_at: 2026-11-06
---

# Entity: tasks

## Entity ID

ENT-TASK-01

## Status

Proposed

## Kind

Collection (Mongoose model `Task`)

## Source Data Entity

DATA-004 Task (shared-context/data.md): title, status, created_at, owner. One shared Task entity for all task features. There is no `lists` collection: DATA-003 List was removed (DEC-042) and the user's one personal list is implicit (BR-002).

## Purpose

Stores each user's tasks. The user's list is `tasks where ownerId = user`.

## Columns / Fields

| Name      | Type     | Constraints                                          | Notes                     | Confidence                 |
| --------- | -------- | ---------------------------------------------------- | ------------------------- | -------------------------- |
| _id       | ObjectId | PK                                                   | exposed as `id`           | Assumed                    |
| ownerId   | ObjectId | required, ref users, indexed                         | privacy boundary (BR-025) | Confirmed (DATA-004 owner) |
| title     | string   | required, 1 to 200 chars after trim                  | BR-016                    | Confirmed                  |
| status    | enum     | required, default `pending`; `pending` / `completed` |                           | Confirmed (BR-008, BR-016) |
| createdAt | Date     | required, default now                                | ordering key (BR-026)     | Confirmed                  |
| updatedAt | Date     | required                                             | Mongoose timestamps       | Assumed                    |

## Keys & Indexes

- PK: `_id`
- Compound index: `{ ownerId: 1, createdAt: -1 }` (list newest first per user)

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
