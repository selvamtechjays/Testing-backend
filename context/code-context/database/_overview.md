---
doc_type: layer-overview
schema_version: 1.1
produced_by: tl
layer: database
generated_at: 2026-11-06
---

# Database Overview

## Stack

MongoDB (Atlas, database `testing-delivery-os`, DEC-004, DEC-011) accessed via Mongoose 9 models (DEC-006). No SQL migrations; indexes are declared on the Mongoose schemas.

## Conventions

One unit per collection. Entities live in `entities/<slug>.md`. Fields are camelCase; `_id` is exposed to clients as `id`. Connection owner: `src/db/mongo.ts` only.

## Entry Points

Models are planned under `src/auth/` (User, Session) and `src/task/` (Task) in the backend repo.

## Notes

Backups (FEAT-PLAT-03) cover `users` and `tasks`; `sessions` is ephemeral.
