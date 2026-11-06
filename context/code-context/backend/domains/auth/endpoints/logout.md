---
doc_type: endpoint
schema_version: 1.1
produced_by: tl
endpoint_id: EP-AUTH-03
method: POST
path: /api/auth/logout
match_key: 'POST /api/auth/logout'
status: Proposed
implementation_state: Planned
origin: designed
generated_at: 2026-11-06
---

# Endpoint: Sign Out

## Endpoint ID

EP-AUTH-03

## Status

Proposed

## Method + Path

POST /api/auth/logout

## Domain

Auth

## Purpose

End the current session on this device (AUTH-UC-06, BR-023).

## Trigger

Called by page(s) — see Called by.

## Request

No body.

## Response

- `204 No Content` and a Set-Cookie that clears the session cookie. Idempotent: also 204 when there is no valid session.
- Response: Assumed

## Auth

Reads the session cookie but never fails on a missing or expired one.

## Behaviour / Business Rules

- Delete the session record so the old cookie can no longer open the task list (BR-023).
- Only the current device's session is ended; sign out of all devices is out of v1 (DEC-048).

## Called by

- PAGE-TASK-01 Task List (Log out control) — ../../../../../../../frontend/context/code-context/frontend/pages/task/task-list.md

## Reads / Writes Entities

- Writes (deletes) sessions — ../../../../database/entities/sessions.md (ENT-AUTH-02)

## Used by Features

- FEAT-AUTH-02 Sign In and Sign Out

## Integrations

- None.

## Open Questions

- None.

## Source References

- Feature: FEAT-AUTH-02
- Workflow: WF-001
- Business rules: BR-023
- Data: DATA-002
