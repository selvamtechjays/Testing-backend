---
doc_type: endpoint
schema_version: 1.1
produced_by: tl
endpoint_id: EP-TASK-03
method: PATCH
path: /api/tasks/:id
match_key: 'PATCH /api/tasks/:P'
status: Proposed
implementation_state: Planned
origin: designed
generated_at: 2026-11-06
---

# Endpoint: Update Task (edit title / complete / reopen)

## Endpoint ID

EP-TASK-03

## Status

Proposed

## Method + Path

PATCH /api/tasks/:id

## Domain

Task

## Purpose

Change a task's title and/or status: tick to Completed, untick to Pending, or correct the title (TASK-UC-03, TASK-UC-04). One partial-update endpoint serves both because both change only fields of the same single-field-set task (design decision).

## Trigger

Called by page(s) — see Called by.

## Request

| Field  | Type                     | Required | Notes                                 | Confidence         |
| ------ | ------------------------ | -------- | ------------------------------------- | ------------------ |
| title  | string                   | no       | trimmed; non-empty; at most 200 chars | Confirmed (BR-016) |
| status | "pending" or "completed" | no       | tick = completed, untick = pending    | Confirmed (BR-008) |

At least one field is required. Path param `id` is the task id. No other field is editable.

## Response

- `200 OK` → `{ task: { id, title, status, createdAt } }`
- `400` empty/over-200 title, invalid status, or empty body; the stored task is unchanged (old title kept)
- `401` no valid session
- `404` task does not exist or belongs to another user (privacy, BR-025)
- Response shape: Assumed

## Auth

Requires a valid session; the task must be owned by the session user.

## Behaviour / Business Rules

- Status changes never move the task or change createdAt; completed tasks stay in the list (BR-008, BR-026).
- Setting status to its current value is a no-op success (idempotent).
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
