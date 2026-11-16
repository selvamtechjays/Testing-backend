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
implemented_at: 2026-11-16T13:07:15Z
implemented_by_commit: cbd69cbb05f298f0448e50e0cf52814f5e1cbd78
implemented_by_task: TASK-TASK-NOTES
mapped_from: src/routes/tasks.ts
mapped_from_line: 52
mapped_from_commit: cbd69cbb05f298f0448e50e0cf52814f5e1cbd78
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

Add a Pending task with a title, and optionally a due date, a priority and notes, to the signed-in user's list (TASK-UC-02, Task-23, Task-24). Called in the background after the screen has already shown the task (instant-update behaviour, FEAT-PLAT-01).

## Trigger

Called by page(s) — see Called by.

## Request

| Field    | Type                 | Required | Notes                                                                                                                            | Confidence                     |
| -------- | -------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| title    | string               | yes      | trimmed; non-empty; at most 200 characters                                                                                       | Confirmed (BR-016)             |
| dueDate  | `YYYY-MM-DD` or null | no       | a real calendar date; past dates allowed; at most the server UTC date + 5 years + 1 day (DEC-211); `null` is the same as omitted | Confirmed (Task-23 AC-2, AC-4) |
| priority | low, medium or high  | no       | defaults to `medium`                                                                                                             | Confirmed (Task-23 AC-1, AC-4) |
| notes    | string or null       | no       | plain text; trimmed; at most 1000 UTF-16 code units after the trim; `''`, whitespace-only or `null` means no notes (DEC-240)     | Confirmed (Task-24 AC-1, AC-3) |

## Response

- `201 Created` → `{ task: { id, title, status: "pending", createdAt, dueDate: "YYYY-MM-DD" | null, priority, notes: string | null } }` (the client replaces its temporary row with the server id and createdAt; `notes` is always present)
- `400` → `{ error: { code: "VALIDATION", fields } }`, checked in order title, dueDate, priority, notes: `title` ("Enter a title." / "Titles can be at most 200 characters."), `dueDate` ("Due date must be a real date in YYYY-MM-DD form." / "Due date can be at most 5 years ahead."), `priority` ("Priority must be low, medium or high."), `notes` ("Notes must be text." / "Notes can be at most 1000 characters.")
- `401` no valid session
- Response shape: Assumed

## Auth

Requires a valid session; owner is taken from the session, never from the body.

## Behaviour / Business Rules

- Status is always Pending on creation (BR-016). Whitespace-only title treated as empty (Assumed).
- A task carries a title, an optional due date, a priority and optional notes; unknown body fields (description, status, ownerId) are stripped and never stored. This supersedes the earlier "title only" rule (DEC-215); `notes` is no longer stripped (DEC-240).
- Notes are stored only when non-empty after the trim, so a task added with no notes stores no `notes` field; inner newlines are kept. Notes are personal text and are never logged.
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
- Task: Task-24 Task notes (DEC-240)
- Code: src/routes/tasks.ts:52
- Code: src/services/tasks.ts:177
- Code: src/lib/taskTitle.ts:15
- Code: src/lib/taskFields.ts:28
- Code: src/lib/taskNotes.ts
- Code: src/lib/calendarDate.ts
- Test: tests/integration/tasks.list-and-add.integration.test.ts
- Test: tests/integration/tasks.notes.integration.test.ts
- Test: tests/unit/taskTitle.test.ts
- Test: tests/unit/taskFields.test.ts
- Test: tests/unit/taskNotes.test.ts
- Test: tests/unit/calendarDate.test.ts
- Test map: context/test-map/due-dates-priority-filters.md
- Test map: context/test-map/task-notes.md
- [code › src/routes/tasks.ts:52]
- [test › tests/integration/tasks.notes.integration.test.ts]
