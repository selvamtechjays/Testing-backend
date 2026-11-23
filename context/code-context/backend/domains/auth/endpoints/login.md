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
mapped_from_line: 34
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
- Throttled (Task-36, DEC-303, DEC-305): the client address is counted first (10 attempts per 15 min), then, after body validation, a username with 5 failed attempts in 15 min is refused before any hashing; a wrong password or unknown username records one failure and a success clears them. A refusal is `429 RATE_LIMITED` "Too many attempts. Try again in a few minutes." with `Retry-After` in seconds, identical for every username. This supersedes DEC-048 / accepted risk R-08 (no lockout).
- The password compare, the dummy compare included, runs through a hash gate: 2 at once, 8 queued, then `503 SERVICE_UNAVAILABLE` with `Retry-After: 5` (DEC-304). Counters and gate are in process memory, single instance (DEC-307).
- The client address is `req.ip`, which follows `TRUST_PROXY_HOPS` (DEC-306).
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
- Code: src/routes/auth.ts:34
- Test: tests/integration/auth-session.test.ts
- Test: tests/integration/auth.rate-limit.integration.test.ts
- Test: tests/contracts/auth.rate-limit.contract.test.ts
- Test map: context/test-map/maturity-hardening-backend.md

## Design deviation

- The 400 body `message` is the shared `parseBody` text "Validation failed"; the per-field `fields` messages are "Enter a username and password." (the plan's message), as for registration (DEC-073).
- Route lives in `src/routes/auth.ts` with logic in `src/services/auth.ts` (`loginUser`), following the repo's route/service layout rather than the plan's separate handler files.
- Task-36 added `RATE_LIMITED` (429) and the hash-gate `503 SERVICE_UNAVAILABLE` to this endpoint (`src/auth/authThrottle.ts`, `src/auth/hashGate.ts`; DEC-303 to DEC-305).
- The dummy hash compare is a fixed well-formed scrypt string at the production cost (DEC-072).
