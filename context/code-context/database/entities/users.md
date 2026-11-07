---
doc_type: entity
schema_version: 1.1
produced_by: tl
entity_id: ENT-AUTH-01
status: Active
implementation_state: Implemented
origin: implemented
generated_at: 2026-11-06
design_confidence: Confirmed
implemented_at: 2026-11-06T13:14:56Z
implemented_by_commit: 02958850e2c6c6ee5cc798464ba396e43d54cb74
implemented_by_task: FEAT-AUTH-01-1
mapped_from: src/models/User.ts
mapped_from_line: 16
mapped_from_commit: 02958850e2c6c6ee5cc798464ba396e43d54cb74
---

# Entity: users

## Entity ID

ENT-AUTH-01

## Status

Active

## Kind

Collection (Mongoose model `User`)

## Source Data Entity

DATA-001 (shared-context/data.md). Note: DATA-001 still lists failed-attempt count and lock-until; those were removed with the lockout (DEC-048) and are deliberately not designed here — the register row is stale.

## Purpose

Stores a TaskNest account: a username and a password hash. Nothing else (no email, name, role, photo, time zone — DEC-040, DEC-042).

## Columns / Fields

| Name         | Type     | Constraints                          | Notes                                                                                                                          | Confidence                                  |
| ------------ | -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| _id          | ObjectId | PK                                   | exposed to the client as `id`                                                                                                  | Assumed                                     |
| username     | string   | required, unique, stored lower-cased | 3 to 30 of [a-z0-9_]; case-insensitive uniqueness (BR-027). Original capitalisation is not kept (Assumed; nothing displays it) | Confirmed rule (DEC-046) / Assumed storage  |
| passwordHash | string   | required                             | adaptive hash, never returned by any endpoint                                                                                  | Confirmed (BR-003 implies hashing: Assumed) |
| createdAt    | Date     | required, default now                |                                                                                                                                | Assumed                                     |

## Keys & Indexes

- PK: `_id`
- Unique index: `username` (the real guard against concurrent duplicate registration)

## Relationships

- 1—N tasks via tasks.ownerId (ENT-TASK-01)
- 1—N sessions via sessions.userId (ENT-AUTH-02)

## Used by Endpoints

- EP-AUTH-01 POST /api/auth/register — ../../backend/domains/auth/endpoints/register.md
- EP-AUTH-02 POST /api/auth/login — ../../backend/domains/auth/endpoints/login.md
- EP-AUTH-04 GET /api/auth/me — ../../backend/domains/auth/endpoints/get-current-user.md

## Used by Features

- FEAT-AUTH-01 Account Registration
- FEAT-AUTH-02 Sign In and Sign Out
- FEAT-PLAT-03 Hosting and Backups (backed-up user data: accounts; no endpoint)

## Data Classification / Retention

- Credentials (password hash). Retention: accounts are never deleted in v1 (account deletion out of scope, DEC-041). Backup: interim daily, kept 7 days (ASM-022, FEAT-PLAT-03).

## Open Questions

- None new. (Invite-only limiting: CLR-035.)

## Source References

- Feature: FEAT-AUTH-01, FEAT-AUTH-02, FEAT-PLAT-03
- Data register: DATA-001
- Business rules: BR-002, BR-003, BR-027
- Code: src/models/User.ts:16
- Test: tests/integration/auth.register.test.ts

## Design deviation

- `createdAt` is set by the service from the injected clock rather than a schema default, so tests control time (coding standard: time is injected).
- `passwordHash` is `scrypt$N$r$p$<salt hex>$<hash hex>` (DEC-058).
