---
doc_type: endpoint
schema_version: 1.1
produced_by: tl
endpoint_id: EP-AUTH-01
method: POST
path: /api/auth/register
match_key: 'POST /api/auth/register'
status: Proposed
implementation_state: Planned
origin: designed
generated_at: 2026-11-06
---

# Endpoint: Register Account

## Endpoint ID

EP-AUTH-01

## Status

Proposed

## Method + Path

POST /api/auth/register

## Domain

Auth

## Purpose

Create a user account from a username and password and sign the new user in at once (AUTH-UC-01).

## Trigger

Called by page(s) — see Called by.

## Request

| Field    | Type   | Required | Notes                                                                      | Confidence                  |
| -------- | ------ | -------- | -------------------------------------------------------------------------- | --------------------------- |
| username | string | yes      | 3 to 30 chars, letters/digits/underscore only; compared case-insensitively | Confirmed (BR-027, DEC-046) |
| password | string | yes      | at least 8 chars; very common passwords refused; no symbol/capital rules   | Confirmed (BR-003, DEC-046) |

## Response

- `201 Created` → `{ user: { id, username } }` and Set-Cookie session cookie (user is signed in)
- `400` validation error → `{ error: { code: "VALIDATION", fields: { username?: msg, password?: msg } } }` naming what to fix
- `409` username already taken in any capitalisation → `fields.username`
- Response shape and status codes: Assumed (TL design)

## Auth

Public (no session). Confidence: Assumed — session mechanism is a TL design assumption (OQ-SCAF-002, CON-005).

## Behaviour / Business Rules

- Normalise username to lower case; validate format; reject if a user with that lower-case username exists (BR-027). Uniqueness is enforced by the unique index so concurrent registrations cannot both succeed.
- Reject password under 8 chars or in a common-password blocklist (BR-003). Blocklist source and size are not specified — OQ-AUTH-01.
- Hash the password with a slow adaptive hash (bcrypt/argon2; library choice at build, Assumed); never store or log plaintext.
- No separate list is created: each user's single personal list is implicit as the set of tasks the user owns (BR-002; design assumption).
- Create a session and set the cookie (same as login, see EP-AUTH-02) so the user lands on the task list.
- No email, verification, CAPTCHA, terms acceptance or invite check (DEC-040, DEC-041; access limiting CLR-035 is unresolved and no check is built).

## Called by

- PAGE-AUTH-01 Register — ../../../../../../../frontend/context/code-context/frontend/pages/auth/register.md

## Reads / Writes Entities

- Reads/Writes users — ../../../../database/entities/users.md (ENT-AUTH-01)
- Writes sessions — ../../../../database/entities/sessions.md (ENT-AUTH-02)

## Used by Features

- FEAT-AUTH-01 Account Registration

## Integrations

- None (no email or identity provider; INT-001/INT-002 removed).

## Open Questions

- OQ-AUTH-01 | Which common-password list (source, size) is used? | TL / Client | Impacts BR-003 acceptance tests | Open
- CLR-035 | How is registration limited to invited testers? | Client | Interim ASM-027: open registration at a private address | Open

## Source References

- Feature: FEAT-AUTH-01 (feature.md → Workflow)
- Workflow: WF-001
- Business rules: BR-002, BR-003, BR-027
- Data: DATA-001 User, DATA-002 Session
