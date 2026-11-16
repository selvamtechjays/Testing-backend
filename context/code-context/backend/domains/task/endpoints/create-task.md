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
implemented_at: 2026-11-16T07:40:00Z
implemented_by_commit: d7158d3e82c56b07b40fb445062ff22a4c482e69
implemented_by_task: TASK-DUE-DATES-PRIORITY-FILTERS
mapped_from: src/routes/tasks.ts
mapped_from_line: 50
mapped_from_commit: d7158d3e82c56b07b40fb445062ff22a4c482e69
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

Add a Pending task with a title, and optionally a due date and a priority, to the signed-in user's list (TASK-UC-02, Task-23). Called in the background after the screen has already shown the task (instant-update behaviour, FEAT-PLAT-01).

## Trigger

Called by page(s) — see Called by.

## Request

| Field    | Type                 | Required | Notes                                                                                                                            | Confidence                     |
| -------- | -------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| title    | string               | yes      | trimmed; non-empty; at most 200 characters                                                                                       | Confirmed (BR-016)             |
| dueDate  | `YYYY-MM-DD` or null | no       | a real calendar date; past dates allowed; at most the server UTC date + 5 years + 1 day (DEC-211); `null` is the same as omitted | Confirmed (Task-23 AC-2, AC-4) |
| priority | low, medium or high  | no       | defaults to `medium`                                                                                                             | Confirmed (Task-23 AC-1, AC-4) |

## Response

- `201 Created` → `{ task: { id, title, status: "pending", createdAt, dueDate: "YYYY-MM-DD" | null, priority } }` (the client replaces its temporary row with the server id and createdAt)
- `400` → `{ error: { code: "VALIDATION", fields } }`, checked in order title, dueDate, priority: `title` ("Enter a title." / "Titles can be at most 200 characters."), `dueDate` ("Due date must be a real date in YYYY-MM-DD form." / "Due date can be at most 5 years ahead."), `priority` ("Priority must be low, medium or high.")
- `401` no valid session
- Response shape: Assumed

## Auth

Requires a valid session; owner is taken from the session, never from the body.

## Behaviour / Business Rules

- Status is always Pending on creation (BR-016). Whitespace-only title treated as empty (Assumed).
- A task carries a title, an optional due date and a priority; unknown body fields (notes, description, status, ownerId) are stripped and never stored. This supersedes the earlier "title only" rule (DEC-215).
- The due date is stored as the plain `YYYY-MM-DD` string, never as a Date, so it cannot shift with a time zone (DEC-214). A task added with no date stores no `dueDate` field.
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
- Task: Task-23 Due dates, priority, and list filters (DEC-210, DEC-211, DEC-214, DEC-215)
- Code: src/routes/tasks.ts:50
- Code: src/services/tasks.ts:172
- Code: src/lib/taskTitle.ts:15
- Code: src/lib/taskFields.ts:28
- Code: src/lib/calendarDate.ts
- Test: tests/integration/tasks.list-and-add.integration.test.ts
- Test: tests/unit/taskTitle.test.ts
- Test: tests/unit/taskFields.test.ts
- Test: tests/unit/calendarDate.test.ts
- Test map: context/test-map/due-dates-priority-filters.md
