---
doc_type: endpoint
schema_version: 1.1
produced_by: tl
endpoint_id: EP-AUTH-04
method: GET
path: /api/auth/me
match_key: 'GET /api/auth/me'
status: Proposed
implementation_state: Planned
origin: designed
generated_at: 2026-11-06
---

# Endpoint: Get Current User

## Endpoint ID

EP-AUTH-04

## Status

Proposed

## Method + Path

GET /api/auth/me

## Domain

Auth

## Purpose

Tell the web app whether a valid session exists, so it can block the task list without one and send the user to sign-in (FEAT-AUTH-02 scope: blocking access without a valid session). Design-inferred endpoint; the feature does not name it.

## Trigger

Called by page(s) — see Called by.

## Request

No body.

## Response

- `200 OK` → `{ user: { id, username } }`
- `401` no, unknown or expired session
- Response: Assumed

## Auth

Requires a valid session.

## Behaviour / Business Rules

- Resolves the session cookie; rejects sessions older than 1 day (BR-004).
- Server-side enforcement is the real access block: every task endpoint also answers 401 without a session. This endpoint only supports the client route guard.

## Called by

- PAGE-TASK-01 Task List (route guard on load) — ../../../../../../../frontend/context/code-context/frontend/pages/task/task-list.md

## Reads / Writes Entities

- Reads sessions — ../../../../database/entities/sessions.md (ENT-AUTH-02)
- Reads users — ../../../../database/entities/users.md (ENT-AUTH-01)

## Used by Features

- FEAT-AUTH-02 Sign In and Sign Out

## Integrations

- None.

## Open Questions

- None.

## Source References

- Feature: FEAT-AUTH-02 (In Scope: blocking access to the task list without a valid session)
- Business rules: BR-004
- Data: DATA-001, DATA-002
