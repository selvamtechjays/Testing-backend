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
implemented_at: 2026-11-16T13:07:15Z
implemented_by_commit: cbd69cbb05f298f0448e50e0cf52814f5e1cbd78
implemented_by_task: TASK-TASK-NOTES
mapped_from: src/models/Task.ts
mapped_from_line: 43
mapped_from_commit: cbd69cbb05f298f0448e50e0cf52814f5e1cbd78
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

| Name      | Type     | Constraints                                                               | Notes                                                                                                                                                                                                                  | Confidence                           |
| --------- | -------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| _id       | ObjectId | PK                                                                        | exposed as `id`                                                                                                                                                                                                        | Assumed                              |
| ownerId   | ObjectId | required, ref users, indexed                                              | privacy boundary (BR-025)                                                                                                                                                                                              | Confirmed (DATA-004 owner)           |
| title     | string   | required, 1 to 200 chars after trim                                       | BR-016                                                                                                                                                                                                                 | Confirmed                            |
| status    | enum     | required, default `pending`; `pending` / `completed`                      |                                                                                                                                                                                                                        | Confirmed (BR-008, BR-016)           |
| dueDate   | string   | optional, `YYYY-MM-DD`; absent when the task has none                     | a calendar date, never a Date, so it cannot shift with a time zone (DEC-214); cleared with `$unset`                                                                                                                    | Confirmed (Task-23 AC-2, AC-3, AC-9) |
| priority  | enum     | `low` / `medium` / `high`, default `medium`                               | rows written before this field existed lack it; every reader maps a missing value to `medium` (DEC-210), because `.lean()` and aggregation skip the default                                                            | Confirmed (Task-23 AC-1)             |
| notes     | string   | optional, at most 1000 chars (`maxlength`); absent when the task has none | plain text, trimmed; cleared with `$unset`, never stored empty (DEC-240); rows written before this field existed lack it and `toTaskDto` reads them as `null`, because `.lean()` and aggregation return rows as stored | Confirmed (Task-24 AC-1, AC-2, AC-3) |
| createdAt | Date     | required, default now                                                     | ordering key (BR-026)                                                                                                                                                                                                  | Confirmed                            |
| updatedAt | Date     | required                                                                  | Mongoose timestamps                                                                                                                                                                                                    | Assumed                              |

## Keys & Indexes

- PK: `_id`
- Compound index: `{ ownerId: 1, createdAt: -1 }` (list newest first per user). No index was added for `dueDate` or `priority`: every list narrows to one owner first (DEC-216).
- No index for `notes`: notes are never queried or searched (Task-24).
- Migration: none. Existing rows are not rewritten (DEC-210, DEC-240); dual-read of a missing `priority`, `dueDate` and `notes` is permanent.

## Relationships

- N—1 users (ENT-AUTH-01)
- N—N tags (ENT-TAG-01) through `tagIds` (DEC-260)

## Planned change — Task tags (designed, not yet built)

Designed by FEAT-TAG-01 and FEAT-TAG-03 (DEC-260, DEC-263). The as-built fields above stay true until `/dev:build` lands the change.

| Name   | Type              | Constraints                                                           | Notes                                                                                                                                                                             | Confidence                       |
| ------ | ----------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| tagIds | array of ObjectId | optional, at most 5 distinct, each a tag of the same owner (ref tags) | realises DATA-009 (the task-to-tag link); absent or `[]` means no tags; rows written before this field existed lack it and every reader maps a missing value to `[]`; no backfill | Confirmed (built in FEAT-TAG-01) |

- Index: multikey `{ ownerId: 1, tagIds: 1 }` serves the `tag` filter and the per-tag task count; the existing `{ ownerId: 1, createdAt: -1 }` is unchanged.
- Deleting a task removes its links with it; deleting a tag `$pull`s its id from the owner's tasks (EP-TAG-04). A stray id left by a race is skipped by readers (DEC-262).
- Relationship: N—N tags (ENT-TAG-01) through `tagIds`.

## Used by Endpoints

- EP-TASK-01 GET /api/tasks — ../../backend/domains/task/endpoints/list-tasks.md
- EP-TASK-02 POST /api/tasks — ../../backend/domains/task/endpoints/create-task.md
- EP-TASK-03 PATCH /api/tasks/:id — ../../backend/domains/task/endpoints/update-task.md
- EP-TASK-04 DELETE /api/tasks/:id — ../../backend/domains/task/endpoints/delete-task.md
- EP-TAG-01 GET /api/tags (reads, taskCount) — ../../backend/domains/tag/endpoints/list-tags.md
- EP-TAG-03 PATCH /api/tags/:id (reads, taskCount) — ../../backend/domains/tag/endpoints/update-tag.md
- EP-TAG-04 DELETE /api/tags/:id (writes, `$pull`) — ../../backend/domains/tag/endpoints/delete-tag.md

## Used by Features

- FEAT-TASK-01 Task List and Add Task
- FEAT-TASK-02 Edit and Complete Task
- FEAT-TASK-03 Delete Task with Undo
- FEAT-PLAT-01 Instant Update with Rollback
- FEAT-TAG-01 Personal tag library (taskCount)
- FEAT-TAG-02 Manage tags
- FEAT-TAG-03 Tag tasks from the task list
- FEAT-TAG-04 Filter the task list by tag
- FEAT-PLAT-03 Hosting and Backups (backed-up user data: tasks; no endpoint)

## Data Classification / Retention

- Personal data, notes included: notes are never logged. Completed tasks never auto-deleted (BR-008); deletion is a hard delete (BR-010). Backup: interim daily, kept 7 days (ASM-022).

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
- Code: src/services/tasks.ts:222
- Task: Task-23 Due dates, priority, and list filters (DEC-210, DEC-214, DEC-215, DEC-216)
- Code: src/models/Task.ts:26
- Test: tests/integration/tasks.filters.integration.test.ts
- Test: tests/integration/tasks.delete.integration.test.ts
- Task: Task-24 Task notes (DEC-240)
- Code: src/models/Task.ts:43
- Code: src/lib/taskNotes.ts
- Test: tests/integration/tasks.notes.integration.test.ts
- Test: tests/unit/taskModel.test.ts
- Test map: context/test-map/task-notes.md
- [code › src/models/Task.ts:43]
- [test › tests/integration/tasks.notes.integration.test.ts]
- Task: Task-25 Personal tag library (DEC-260, DEC-262; FEAT-TAG-01 adds the optional `tagIds` field and its multikey index; nothing reads or writes it yet)
- Code: src/models/Task.ts:47
- Test: tests/unit/taskModel.test.ts
- Test map: context/test-map/task-tags.md
- Task: Task-29 Tag tasks from the task list (DEC-260, DEC-262; writes `tagIds` through EP-TASK-02 and EP-TASK-03, reads it through EP-TASK-01)
- Code: src/services/tasks.ts:185
- Test: tests/integration/tasks.tags.integration.test.ts
- Task: Task-31 Filter the task list by tag (DEC-259, DEC-262; reads `tagIds` through the multikey index in EP-TASK-01)
- Code: src/services/tasks.ts:95
- Test: tests/integration/tasks.tag-filter.integration.test.ts
- Task: Task-33 Manage tags (a tag delete pulls its id from `tagIds` with one `updateMany`, stamping `updatedAt`)
- Code: src/services/tags.ts:167
- Test: tests/integration/tags.update-delete.integration.test.ts
