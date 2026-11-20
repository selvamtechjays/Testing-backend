---
doc_type: endpoint
schema_version: 1.1
produced_by: tl
endpoint_id: EP-TAG-03
method: PATCH
path: /api/tags/:id
match_key: 'PATCH /api/tags/:P'
status: Active
implementation_state: Implemented
origin: implemented
design_confidence: Confirmed
generated_at: 2026-11-20
implemented_by_commit: pending
mapped_from_commit: pending
implemented_at: 2026-11-20T11:16:12Z
implemented_by_task: FEAT-TAG-02
mapped_from: src/routes/tags.ts
mapped_from_line: 40
---

# Endpoint: Rename or Recolour Tag

## Endpoint ID

EP-TAG-03

## Status

Designed

## Method + Path

PATCH /api/tags/:id

## Domain

Tag

## Purpose

Rename and/or recolour one of the user's own tags (TAGM-UC-01, TAGM-FR-03, TAGM-FR-04). Every task that carries the tag shows the change because tasks hold only the tag id (DEC-260); no task is written.

## Trigger

Called by page(s) — see Called by.

## Request

| Field  | Type   | Required | Notes                                                                                  | Confidence                 |
| ------ | ------ | -------- | -------------------------------------------------------------------------------------- | -------------------------- |
| name   | string | no       | same rule as create: trimmed, 1 to 30 UTF-16 code units, unique per user ignoring case | Confirmed (BR-040, BR-041) |
| colour | string | no       | one of the six colours                                                                 | Confirmed (BR-042)         |

Path param `id` is the tag id. At least one of `name`, `colour` is required. The id is checked before the body.

## Response

- `200 OK` → `{ tag: { id, name, colour, taskCount } }` (the current count, so the panel needs no second read)
- `400 VALIDATION` → `fields.name` (empty, over 30, duplicate of another of the user's tags ignoring case), `fields.colour` (outside the six), `fields.body` for a body with neither field. The stored tag is unchanged.
- `401` no valid session
- `404` "not found" for a malformed id, an unknown id and another user's id, identically (DEC-259, BR-046)
- Response shape: Assumed

## Auth

Requires a valid session; the write is filtered by id and owner, so another user's tag cannot be changed.

## Behaviour / Business Rules

- Order of checks: session, path id (404), body shape and values (400), then the write (404 again if the tag is gone, 400 on a duplicate-key refusal).
- A tag is never a duplicate of itself: changing only the letter case of its own name is allowed, and a request that alters nothing succeeds with no change (ASM-044, AC-16).
- The new name is compared with the user's other tags by the case-insensitive unique index (DEC-261), so two simultaneous renames to one name leave one accepted and one refused as a duplicate (R-12).
- A tag deleted by one request cannot be renamed by a later one: the write matches nothing and answers 404 (TAGM concurrency NFR).

## Called by

- PAGE-TASK-01 Task List — ../../../../../../../frontend/context/code-context/frontend/pages/task/task-list.md

## Reads / Writes Entities

- Reads/Writes tags — ../../../../database/entities/tags.md (ENT-TAG-01)
- Reads tasks (taskCount in the answer) — ../../../../database/entities/tasks.md (ENT-TASK-01)
- Reads sessions (via requireSession) — ../../../../database/entities/sessions.md (ENT-AUTH-02)

## Used by Features

- FEAT-TAG-02 Manage tags

## Integrations

- None.

## Open Questions

- None.

## Source References

- Feature: FEAT-TAG-02 (AC-2, AC-3, AC-9 to AC-16, AC-18, AC-19)
- Workflow: WF-010
- Business rules: BR-040 to BR-042, BR-046
- Data: DATA-008
- Decisions: DEC-259, DEC-260, DEC-261
- Assumptions: ASM-044, ASM-063, ASM-066, ASM-067; CON-010 closed
- [code › src/routes/tags.ts:40]
- [code › src/services/tags.ts:139]
- [code › src/lib/tagFields.ts (updateTagSchema)]
- [code › src/lib/tagId.ts]
- [test › tests/integration/tags.update-delete.integration.test.ts]
- [test › tests/integration/tags.update-delete.concurrency.integration.test.ts]
- [test › tests/unit/tagFields.test.ts]
- [test › tests/contracts/tags.update-delete.contract.test.ts]
- [test map › context/test-map/task-tags.md]
