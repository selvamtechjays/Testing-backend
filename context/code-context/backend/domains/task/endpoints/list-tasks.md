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
implemented_at: 2026-11-16T07:40:00Z
implemented_by_commit: d7158d3e82c56b07b40fb445062ff22a4c482e69
implemented_by_task: TASK-DUE-DATES-PRIORITY-FILTERS
mapped_from: src/routes/tasks.ts
mapped_from_line: 46
mapped_from_commit: d7158d3e82c56b07b40fb445062ff22a4c482e69
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

Return the signed-in user's own tasks, each with its status, due date and priority (TASK-UC-08), newest first by default. The list can be narrowed by status, priority and due date, sorted by due date or priority, and combined with search (Task-23). Completed tasks are included unless a filter excludes them (BR-008).

## Trigger

Called by page(s) — see Called by.

## Request

| Input      | Location | Type                                     | Required                         | Constraint                                                                                                                       |
| ---------- | -------- | ---------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `search`   | query    | string                                   | no                               | Single value; trimmed; at most 100 UTF-16 code units after the trim; empty or whitespace-only means no filter (DEC-208, Task-22) |
| `status`   | query    | `pending` \| `completed`                 | no                               | Omitted means both                                                                                                               |
| `priority` | query    | `low` \| `medium` \| `high`              | no                               | Omitted means all; `medium` also matches a stored task with no priority (DEC-210)                                                |
| `due`      | query    | `overdue` \| `today` \| `week` \| `none` | no                               | Omitted means all                                                                                                                |
| `sort`     | query    | `newest` \| `due` \| `priority`          | no                               | Omitted means `newest`                                                                                                           |
| `today`    | query    | `YYYY-MM-DD`                             | when `due` is overdue/today/week | A real calendar date: the caller's local today (DEC-218); the server never uses its own clock for it                             |

Every key must be a single value; a repeated key is refused under its own name. Request: `GET /api/tasks?status=pending&due=week&sort=due&today=2026-11-16`. The search text is matched as a literal, case-insensitive substring of the title (regex metacharacters are escaped, never run as a pattern). Other query keys are ignored, including bracket forms such as `search[$ne]=x` or `status[$ne]=x`: the app uses Express's default (simple) query parser, so that arrives as a different key and never as a nested value. No pagination in v1 (out of scope; no volume target given — pagination Assumed unnecessary). No new index: the existing owner index narrows first, then the other filters apply within that owner's rows.

Meaning of the filters: `overdue` is `dueDate < today` and status pending; `today` is `dueDate = today`; `week` is `today <= dueDate <= today + 6`; `none` is no due date. `sort=due` orders by date ascending with undated tasks last; `sort=priority` orders High, Medium, Low (a missing priority ranks as Medium); ties are always `createdAt` descending, then `id` descending. Due and priority sorts run as an aggregation with a computed key (DEC-216); the default sort is unchanged.

## Response

- `200 OK` → `{ tasks: [ { id, title, status: "pending" | "completed", createdAt, dueDate: "YYYY-MM-DD" | null, priority: "low" | "medium" | "high" } ], overdueCount? }`. A task stored before these fields existed reads as `dueDate: null`, `priority: "medium"` (DEC-210). Default order is createdAt descending, tie-break id descending (BR-026). Empty array for a new user (drives the empty-state prompt) and when nothing matches. `overdueCount` is present only when `today` was sent: the owner's pending tasks due before `today`, counting all of the owner's tasks whatever the filters and search are (DEC-212).
- `400 VALIDATION` → `Validation failed` with one `fields.<key>` per refused key: `search` ("Search text must be a single value." / "Search text can be at most 100 characters."), `status` ("Status must be pending or completed", the same string PATCH uses), `priority` ("Priority must be low, medium or high."), `due` ("Due filter must be overdue, today, week or none."), `sort` ("Sort must be newest, due or priority."), a repeated `status`, `priority`, `due`, `sort` or `today` key gets "<Field> must be a single value."; `today` ("Today must be a real date in YYYY-MM-DD form." / "Send today's date with this due filter." when `due` is overdue/today/week and `today` is missing)
- `401` no valid session
- Response shape: Assumed

## Auth

Requires a valid session; results scoped to the session user (BR-025).

## Behaviour / Business Rules

- Only tasks whose owner is the session user are returned; never another user's (BR-025, DEC-031).
- Completed tasks are not hidden (BR-008).
- The owner filter is unconditional: it is applied whatever the search text is, so a search never widens what a user can see (Task-22 AC-5).
- Only titles are searched; capitals are ignored; a missing, empty or whitespace-only `search` returns the full list (Task-22 AC-1..AC-4).
- Status, priority, due, sort and search all combine, and the owner filter stays first in the match, the aggregation and the overdue count (Task-23 AC-7).
- A due filter without `today` is refused; the server never decides what "today" is (Task-23 AC-8, DEC-218).

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
- Task: Task-23 Due dates, priority, and list filters (DEC-210, DEC-212, DEC-214, DEC-216, DEC-218)
- Code: src/routes/tasks.ts:46
- Code: src/services/tasks.ts:155
- Code: src/lib/taskSearch.ts:48
- Test: tests/integration/tasks.list-and-add.integration.test.ts
- Test: tests/integration/tasks.filters.integration.test.ts
- Test: tests/contracts/tasks.list-and-add.contract.test.ts
- Test: tests/unit/taskSearch.test.ts
- Test map: context/test-map/due-dates-priority-filters.md
