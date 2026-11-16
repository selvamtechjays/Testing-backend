---
doc_type: endpoint
schema_version: 1.1
produced_by: tl
endpoint_id: EP-TASK-01
method: GET
path: /api/tasks
match_key: 'GET /api/tasks'
status: Active
implementation_state: Implemented
origin: implemented
generated_at: 2026-11-06
design_confidence: Confirmed
implemented_at: 2026-11-07T11:05:00Z
implemented_by_commit: e58dea19ae916587d5d5e23474c436b2c285f11e
implemented_by_task: FEAT-TASK-01-1
mapped_from: src/routes/tasks.ts
mapped_from_line: 38
mapped_from_commit: d66349bcadff7c10fe4d9fcb042a8ea49d651155
---

# Endpoint: List My Tasks

## Endpoint ID

EP-TASK-01

## Status

Active

## Method + Path

GET /api/tasks

## Domain

Task

## Purpose

Return the signed-in user's own tasks, newest first, each with its Pending or Completed status (TASK-UC-08). Completed tasks are always included (BR-008).

## Trigger

Called by page(s) — see Called by.

## Request

| Input    | Location | Type   | Required | Constraint                                                                                                                       |
| -------- | -------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `search` | query    | string | no       | Single value; trimmed; at most 100 UTF-16 code units after the trim; empty or whitespace-only means no filter (DEC-208, Task-22) |

Request: `GET /api/tasks?search=milk`. The text is matched as a literal, case-insensitive substring of the title (regex metacharacters are escaped, never run as a pattern). Other query keys are ignored, including bracket forms such as `search[$ne]=x`: the app uses Express's default (simple) query parser, so that arrives as a different key and never as a nested `search` value. No sort option or pagination in v1 (out of scope; no volume target given — pagination Assumed unnecessary). No new index: the existing owner index narrows first, then the title filter applies within that owner's rows.

## Response

- `200 OK` → `{ tasks: [ { id, title, status: "pending" | "completed", createdAt } ] }` ordered by createdAt descending, tie-break id descending (BR-026). Empty array for a new user (drives the empty-state prompt) and when no title matches the search.
- `400 VALIDATION` → `Validation failed` with `fields.search` = "Search text must be a single value." (a repeated `search`) or "Search text can be at most 100 characters." (over 100 after the trim)
- `401` no valid session
- Response shape: Assumed

## Auth

Requires a valid session; results scoped to the session user (BR-025).

## Behaviour / Business Rules

- Only tasks whose owner is the session user are returned; never another user's (BR-025, DEC-031).
- Completed tasks are not hidden (BR-008).
- The owner filter is unconditional: it is applied whatever the search text is, so a search never widens what a user can see (Task-22 AC-5).
- Only titles are searched; capitals are ignored; a missing, empty or whitespace-only `search` returns the full list (Task-22 AC-1..AC-4).

## Called by

- PAGE-TASK-01 Task List — ../../../../../../../frontend/context/code-context/frontend/pages/task/task-list.md

## Reads / Writes Entities

- Reads tasks — ../../../../database/entities/tasks.md (ENT-TASK-01)
- Reads sessions (via requireSession) — ../../../../database/entities/sessions.md (ENT-AUTH-02)

## Used by Features

- FEAT-TASK-01 Task List and Add Task

## Integrations

- None.

## Open Questions

- None.

## Source References

- Feature: FEAT-TASK-01
- Workflow: WF-002
- Business rules: BR-008, BR-025, BR-026
- Data: DATA-004
- Task: Task-22 Search tasks by title (DEC-208)
- Code: src/routes/tasks.ts:38
- Code: src/services/tasks.ts:40
- Code: src/lib/taskSearch.ts
- Test: tests/integration/tasks.list-and-add.integration.test.ts
- Test: tests/contracts/tasks.list-and-add.contract.test.ts
- Test: tests/unit/taskSearch.test.ts
