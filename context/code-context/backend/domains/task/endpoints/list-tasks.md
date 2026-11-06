---
doc_type: endpoint
schema_version: 1.1
produced_by: tl
endpoint_id: EP-TASK-01
method: GET
path: /api/tasks
match_key: 'GET /api/tasks'
status: Proposed
implementation_state: Planned
origin: designed
generated_at: 2026-11-06
---

# Endpoint: List My Tasks

## Endpoint ID

EP-TASK-01

## Status

Proposed

## Method + Path

GET /api/tasks

## Domain

Task

## Purpose

Return the signed-in user's own tasks, newest first, each with its Pending or Completed status (TASK-UC-08). Completed tasks are always included (BR-008).

## Trigger

Called by page(s) — see Called by.

## Request

No parameters. No filter, sort option or pagination in v1 (out of scope; no volume target given — pagination Assumed unnecessary).

## Response

- `200 OK` → `{ tasks: [ { id, title, status: "pending" | "completed", createdAt } ] }` ordered by createdAt descending, tie-break id descending (BR-026). Empty array for a new user (drives the empty-state prompt).
- `401` no valid session
- Response shape: Assumed

## Auth

Requires a valid session; results scoped to the session user (BR-025).

## Behaviour / Business Rules

- Only tasks whose owner is the session user are returned; never another user's (BR-025, DEC-031).
- Completed tasks are not hidden (BR-008).

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
