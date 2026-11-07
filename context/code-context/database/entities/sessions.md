---
doc_type: entity
schema_version: 1.1
produced_by: tl
entity_id: ENT-AUTH-02
status: Active
implementation_state: Implemented
origin: implemented
generated_at: 2026-11-06
design_confidence: Confirmed
implemented_at: 2026-11-06T13:14:56Z
implemented_by_commit: 02958850e2c6c6ee5cc798464ba396e43d54cb74
implemented_by_task: FEAT-AUTH-01-1
mapped_from: src/models/Session.ts
mapped_from_line: 19
mapped_from_commit: 02958850e2c6c6ee5cc798464ba396e43d54cb74
---

# Entity: sessions

## Entity ID

ENT-AUTH-02

## Status

Active

## Kind

Collection (Mongoose model `Session`)

## Source Data Entity

DATA-002 Session (shared-context/data.md): user, expiry.

## Purpose

Server-side session store backing the HttpOnly session cookie (design assumption, OQ-SCAF-002 / CON-005). Chosen over JWT so logout really ends the session (BR-023) and the 1-day cap (BR-004) is enforced server-side.

## Columns / Fields

| Name      | Type     | Constraints         | Notes                                                                                                                                      | Confidence           |
| --------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| _id       | string   | PK                  | SHA-256 hex of the cookie value (a cryptographically random 256-bit token kept only in the cookie); lookups hash the incoming cookie first | Assumed              |
| userId    | ObjectId | required, ref users |                                                                                                                                            | Confirmed (DATA-002) |
| createdAt | Date     | required            |                                                                                                                                            | Assumed              |
| expiresAt | Date     | required            | createdAt + 1 day (BR-004)                                                                                                                 | Likely (ASM-023)     |

## Keys & Indexes

- PK: `_id`
- Index: `userId`
- TTL index on `expiresAt` (expireAfterSeconds 0) so expired sessions are purged by MongoDB; requests also check expiresAt because TTL deletion is not instantaneous.

## Relationships

- N—1 users (ENT-AUTH-01)

## Used by Endpoints

- EP-AUTH-01 POST /api/auth/register — ../../backend/domains/auth/endpoints/register.md
- EP-AUTH-02 POST /api/auth/login — ../../backend/domains/auth/endpoints/login.md
- EP-AUTH-03 POST /api/auth/logout — ../../backend/domains/auth/endpoints/logout.md
- EP-AUTH-04 GET /api/auth/me — ../../backend/domains/auth/endpoints/get-current-user.md
- EP-TASK-01 GET /api/tasks — ../../backend/domains/task/endpoints/list-tasks.md
- EP-TASK-02 POST /api/tasks — ../../backend/domains/task/endpoints/create-task.md
- EP-TASK-03 PATCH /api/tasks/:id — ../../backend/domains/task/endpoints/update-task.md
- EP-TASK-04 DELETE /api/tasks/:id — ../../backend/domains/task/endpoints/delete-task.md

## Used by Features

- FEAT-AUTH-01 Account Registration
- FEAT-AUTH-02 Sign In and Sign Out
- FEAT-TASK-01 Task List and Add Task
- FEAT-TASK-02 Edit and Complete Task
- FEAT-TASK-03 Delete Task with Undo

## Data Classification / Retention

- Security-sensitive (session ids). Ephemeral; no backup needed (re-sign-in is acceptable).

## Open Questions

- Session expiry is held as ASM-023 (Likely), not confirmed by the client.

## Source References

- Feature: FEAT-AUTH-01, FEAT-AUTH-02
- Data register: DATA-002
- Business rules: BR-004, BR-023
- Code: src/models/Session.ts:19
- Test: tests/integration/auth.register.test.ts

## Design deviation

- `_id` is 32 random bytes hex encoded (256 bits, above the 128-bit minimum designed). Indexes (`userId`, TTL on `expiresAt`) are built by `Session.init()` awaited at server start.
