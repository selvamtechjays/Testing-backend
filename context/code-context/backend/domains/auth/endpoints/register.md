---
doc_type: endpoint
schema_version: 1.1
produced_by: tl
endpoint_id: EP-AUTH-01
method: POST
path: /api/auth/register
match_key: 'POST /api/auth/register'
status: Active
implementation_state: Implemented
origin: implemented
generated_at: 2026-11-06
design_confidence: Confirmed
implemented_at: 2026-11-06T13:14:56Z
implemented_by_commit: 02958850e2c6c6ee5cc798464ba396e43d54cb74
implemented_by_task: FEAT-AUTH-01-1
mapped_from: src/routes/auth.ts
mapped_from_line: 22
mapped_from_commit: a10b022376d046165ef04f1136deb3f92d38d3ce
---

# Endpoint: Register Account

## Endpoint ID

EP-AUTH-01

## Status

Active

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
- Code: src/routes/auth.ts:22
- Test: tests/integration/auth.register.test.ts

## Design deviation

- Password hash is Node `crypto.scrypt` (N=32768, r=8, p=3, per-user salt), as DEC-058 settled; the design text above still says bcrypt/argon2.
- The common-password blocklist is a bundled subset of about 150 entries of 8+ characters compiled from published top lists (DEC-059); OQ-AUTH-01 stays open for the client to name a fuller list.
- The 400 body `message` is the shared `parseBody` text "Validation failed" (owned by FEAT-PLAT-01), not the "Check the highlighted fields." wording in the sub-task plan; the per-field `fields` messages are as designed (DEC-073).
- Session cookie name is `sid`; the session insert follows the user insert, and a session failure leaves the user and answers a generic 500 (DEC-073).
