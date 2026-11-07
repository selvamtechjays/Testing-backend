---
doc_type: endpoint
schema_version: 1.1
produced_by: tl
endpoint_id: EP-AUTH-02
method: POST
path: /api/auth/login
match_key: 'POST /api/auth/login'
status: Active
implementation_state: Implemented
origin: implemented
generated_at: 2026-11-06
design_confidence: Confirmed
implemented_at: 2026-11-07T07:37:50Z
implemented_by_commit: a10b022376d046165ef04f1136deb3f92d38d3ce
implemented_by_task: FEAT-AUTH-02-1
mapped_from: src/routes/auth.ts
mapped_from_line: 28
mapped_from_commit: a10b022376d046165ef04f1136deb3f92d38d3ce
---

# Endpoint: Sign In

## Endpoint ID

EP-AUTH-02

## Status

Active

## Method + Path

POST /api/auth/login

## Domain

Auth

## Purpose

Verify username and password and start a session (AUTH-UC-03).

## Trigger

Called by page(s) — see Called by.

## Request

| Field    | Type   | Required | Notes                      | Confidence         |
| -------- | ------ | -------- | -------------------------- | ------------------ |
| username | string | yes      | matched case-insensitively | Confirmed (BR-027) |
| password | string | yes      |                            | Confirmed          |

## Response

- `200 OK` → `{ user: { id, username } }` and Set-Cookie session cookie
- `401` one generic error for unknown username or wrong password, never saying which (feature scope)
- `400` malformed body (missing fields)
- Response shape: Assumed

## Auth

Public.

## Behaviour / Business Rules

- Look up by lower-cased username and compare the password hash; for an unknown user still run a dummy hash compare so timing does not reveal which field was wrong (Assumed hardening).
- No lockout and no attempt counting (DEC-048 removed BR-005). Residual brute-force exposure is accepted risk R-08; no rate limiting is designed.
- Create a session with expiresAt = now + 1 day; the cookie has no Max-Age so the browser drops it on close (BR-004, held as ASM-023). No Remember me.

## Called by

- PAGE-AUTH-02 Sign In — ../../../../../../../frontend/context/code-context/frontend/pages/auth/sign-in.md

## Reads / Writes Entities

- Reads users — ../../../../database/entities/users.md (ENT-AUTH-01)
- Writes sessions — ../../../../database/entities/sessions.md (ENT-AUTH-02)

## Used by Features

- FEAT-AUTH-02 Sign In and Sign Out

## Integrations

- None.

## Open Questions

- None specific (session mechanism tracked as OQ-SCAF-002; assumption recorded in the layer overview).

## Source References

- Feature: FEAT-AUTH-02
- Workflow: WF-001
- Business rules: BR-004, BR-027
- Data: DATA-001, DATA-002
- Code: src/routes/auth.ts:28
- Test: tests/integration/auth-session.test.ts

## Design deviation

- The 400 body `message` is the shared `parseBody` text "Validation failed"; the per-field `fields` messages are "Enter a username and password." (the plan's message), as for registration (DEC-073).
- Route lives in `src/routes/auth.ts` with logic in `src/services/auth.ts` (`loginUser`), following the repo's route/service layout rather than the plan's separate handler files.
- The dummy hash compare is a fixed well-formed scrypt string at the production cost (DEC-072).
