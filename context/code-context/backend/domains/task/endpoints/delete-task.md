---
doc_type: endpoint
schema_version: 1.1
produced_by: tl
endpoint_id: EP-TASK-04
method: DELETE
path: /api/tasks/:id
match_key: 'DELETE /api/tasks/:P'
status: Proposed
implementation_state: Planned
origin: designed
generated_at: 2026-11-06
---

# Endpoint: Delete Task

## Endpoint ID

EP-TASK-04

## Status

Proposed

## Method + Path

DELETE /api/tasks/:id

## Domain

Task

## Purpose

Permanently delete one of the user's tasks, Pending or Completed (TASK-UC-05). Hard delete: there is no trash and no restore endpoint (BR-010, DEC-032).

## Trigger

Called by page(s) — see Called by.

## Request

Path param `id` only. No body.

## Response

- `204 No Content`
- `401` no valid session
- `404` task does not exist or belongs to another user (BR-025)
- Response: Assumed

## Auth

Requires a valid session; the task must be owned by the session user.

## Behaviour / Business Rules

- Undo design (Assumed, see DEC proposal): the 5-second Undo window is handled on the client by deferring this call until the window ends. Clicking Undo cancels the pending call, so the server never sees the delete and restoring the task "exactly as it was" (title, status, place) is trivially true. No soft-delete field, restore endpoint or purge job exists.
- Consequence: if the tab is closed inside the window the client should flush the pending delete on unload (best effort); otherwise the task survives. Not a data-loss risk; recorded as OQ-TASK-01.
- If the deferred call fails, the screen rolls back and shows a message (BR-018, FEAT-PLAT-01).

## Called by

- PAGE-TASK-01 Task List — ../../../../../../../frontend/context/code-context/frontend/pages/task/task-list.md

## Reads / Writes Entities

- Writes (deletes) tasks — ../../../../database/entities/tasks.md (ENT-TASK-01)
- Reads sessions (via requireSession) — ../../../../database/entities/sessions.md (ENT-AUTH-02)

## Used by Features

- FEAT-TASK-03 Delete Task with Undo
- FEAT-PLAT-01 Instant Update with Rollback

## Integrations

- None.

## Open Questions

- OQ-TASK-01 | Is a delete interrupted by closing the tab inside the 5-second Undo window allowed to be lost (task survives), or must it be flushed on unload? | TL / Client | Impacts the deferred-delete design of TASK-UC-05 | Open (non-blocking; best-effort flush assumed)

## Source References

- Feature: FEAT-TASK-03, FEAT-PLAT-01
- Workflow: WF-002, WF-003
- Business rules: BR-010, BR-018, BR-025
- Data: DATA-004
