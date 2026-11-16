---
doc_type: endpoint
schema_version: 1.1
produced_by: tl
endpoint_id: EP-TASK-03
method: PATCH
path: /api/tasks/:id
match_key: 'PATCH /api/tasks/:P'
status: Active
implementation_state: Implemented
origin: implemented
generated_at: 2026-11-06
design_confidence: Confirmed
implemented_at: 2026-11-16T07:40:00Z
implemented_by_commit: d7158d3e82c56b07b40fb445062ff22a4c482e69
implemented_by_task: TASK-DUE-DATES-PRIORITY-FILTERS
mapped_from: src/routes/tasks.ts
mapped_from_line: 56
mapped_from_commit: d7158d3e82c56b07b40fb445062ff22a4c482e69
---

# Endpoint: Update Task (edit title / complete / reopen)

## Endpoint ID

EP-TASK-03

## Status

Active

## Method + Path

PATCH /api/tasks/:id

## Domain

Task

## Purpose

Change a task's title, status, due date and/or priority: tick to Completed, untick to Pending, correct the title, set, change or clear the due date, or change the priority (TASK-UC-03, TASK-UC-04, Task-23). One partial-update endpoint serves both because both change only fields of the same single-field-set task (design decision).

## Trigger

Called by page(s) — see Called by.

## Request

| Field    | Type                     | Required | Notes                                                                                  | Confidence                     |
| -------- | ------------------------ | -------- | -------------------------------------------------------------------------------------- | ------------------------------ |
| title    | string                   | no       | trimmed; non-empty; at most 200 chars                                                  | Confirmed (BR-016)             |
| status   | "pending" or "completed" | no       | tick = completed, untick = pending                                                     | Confirmed (BR-008)             |
| dueDate  | `YYYY-MM-DD` or null     | no       | same rule as create; `null` clears the date (the field is removed, not stored as null) | Confirmed (Task-23 AC-3, AC-4) |
| priority | low, medium or high      | no       | same rule as create                                                                    | Confirmed (Task-23 AC-3, AC-4) |

At least one of the four fields is required (`dueDate: null` counts). Path param `id` is the task id. No other field is editable.

## Response

- `200 OK` → `{ task: { id, title, status, createdAt, dueDate, priority } }`; clearing a date returns `"dueDate": null`
- `400` each refused field under `fields.<name>` (`title`, `status`, `dueDate`, `priority`: `status` uses "Status must be pending or completed" (no full stop, shared with the list filter), `priority` and `dueDate` use the create messages), or `fields.body` = "Provide a title, status, due date or priority" for an empty body; the stored task is unchanged
- `401` no valid session
- `404` task does not exist or belongs to another user (privacy, BR-025)
- Response shape: Assumed

## Auth

Requires a valid session; the task must be owned by the session user.

## Behaviour / Business Rules

- Status changes never move the task or change createdAt; completed tasks stay in the list (BR-008, BR-026).
- Setting a field to its current value is a no-op success (idempotent).
- Only the fields sent and `updatedAt` are written, in one atomic write filtered by id and owner; a `null` due date is written as `$unset`. A task stored without a priority reads as `medium` until one is set (DEC-210).
- Failure is surfaced by rolling the screen back (BR-018, FEAT-PLAT-01).
- No edit history or audit trail (out of scope).

## Called by

- PAGE-TASK-01 Task List — ../../../../../../../frontend/context/code-context/frontend/pages/task/task-list.md

## Reads / Writes Entities

- Reads/Writes tasks — ../../../../database/entities/tasks.md (ENT-TASK-01)
- Reads sessions (via requireSession) — ../../../../database/entities/sessions.md (ENT-AUTH-02)

## Used by Features

- FEAT-TASK-02 Edit and Complete Task
- FEAT-PLAT-01 Instant Update with Rollback

## Integrations

- None.

## Open Questions

- None.

## Source References

- Feature: FEAT-TASK-02, FEAT-PLAT-01
- Workflow: WF-002, WF-003
- Business rules: BR-008, BR-016, BR-018, BR-025
- Data: DATA-004
- Task: Task-23 Due dates, priority, and list filters (DEC-210, DEC-211, DEC-214)
- Code: src/routes/tasks.ts:56
- Code: src/services/tasks.ts:199
- Code: src/lib/taskUpdate.ts:16
- Code: src/lib/taskFields.ts:28
- Test: tests/integration/tasks.update.integration.test.ts
- Test: tests/unit/taskUpdate.test.ts
- Test: tests/contracts/tasks.update.contract.test.ts
- Test map: context/test-map/due-dates-priority-filters.md
