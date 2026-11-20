---
doc_type: entity
schema_version: 1.1
produced_by: tl
entity_id: ENT-TAG-01
status: Active
implementation_state: Implemented
origin: implemented
design_confidence: Confirmed
generated_at: 2026-11-20
implemented_by_commit: pending
mapped_from_commit: pending
implemented_at: 2026-11-20T10:56:43Z
implemented_by_task: FEAT-TAG-01
mapped_from: src/models/Tag.ts
mapped_from_line: 36
---

# Entity: tags

## Entity ID

ENT-TAG-01

## Status

Designed

## Kind

Collection (Mongoose model `Tag`, src/models/Tag.ts)

## Source Data Entity

DATA-008 Tag (shared-context/data.md): owner, name, colour. The task-to-tag link, DATA-009, is realised as the `tagIds` array on ENT-TASK-01 (DEC-260), not as a collection of its own.

## Purpose

Stores each user's private, named, coloured tags. The user's tag library is `tags where ownerId = user`. A tag never stores how many tasks carry it: that count is worked out when asked (DEC-263).

## Columns / Fields

| Name      | Type     | Constraints                                                             | Notes                                                                                                                | Confidence                           |
| --------- | -------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| _id       | ObjectId | PK                                                                      | exposed as `id`                                                                                                      | Assumed                              |
| ownerId   | ObjectId | required, ref users, indexed                                            | privacy boundary; set from the session only (BR-040)                                                                 | Confirmed (DATA-008 owner)           |
| name      | string   | required, trimmed, 1 to 30 UTF-16 code units                            | plain text stored as typed (case kept, inner spaces kept, markup stored literally); compared ignoring case (DEC-261) | Confirmed (BR-041); counting Assumed |
| colour    | enum     | required, default `gray`; `gray` `red` `orange` `green` `blue` `purple` | the shade of each colour is a design token, not stored (OQ-TAG-01)                                                   | Confirmed (BR-042)                   |
| slot      | integer  | required, 0 to 49                                                       | the stored form of the 50-tag cap: unique per owner, so a 51st row cannot exist (DEC-261); never shown               | Assumed (design)                     |
| createdAt | Date     | required                                                                | set from the injected clock (coding-standards backend s10), as tasks do                                              | Assumed                              |
| updatedAt | Date     | required                                                                | set from the injected clock on every change                                                                          | Assumed                              |

## Keys & Indexes

- PK: `_id`
- Unique compound index `{ ownerId: 1, name: 1 }` with collation `{ locale: 'en', strength: 2 }`: names are unique per user ignoring case, across accented and non-Latin letters, and two users may share a name (BR-040, ASM-067). It also serves the per-user list sorted by name.
- Unique compound index `{ ownerId: 1, slot: 1 }`: at most 50 tags per user, enforced where the data is stored (BR-043, R-12). Create takes the smallest free slot; a duplicate-key on this index means another create took it, so retry; a delete frees its slot.
- Migration: none. The collection is new; no existing row changes.

## Relationships

- N—1 users (ENT-AUTH-01) through `ownerId`
- N—N tasks (ENT-TASK-01) through the `tagIds` array held on each task, at most 5 per task (DEC-260)

## Used by Endpoints

- EP-TAG-01 GET /api/tags — ../../backend/domains/tag/endpoints/list-tags.md
- EP-TAG-02 POST /api/tags — ../../backend/domains/tag/endpoints/create-tag.md
- EP-TAG-03 PATCH /api/tags/:id — ../../backend/domains/tag/endpoints/update-tag.md
- EP-TAG-04 DELETE /api/tags/:id — ../../backend/domains/tag/endpoints/delete-tag.md
- EP-TASK-01 GET /api/tasks (validates the `tag` filter, resolves each task's tags) — ../../backend/domains/task/endpoints/list-tasks.md
- EP-TASK-02 POST /api/tasks (validates `tagIds`, resolves the answer's tags) — ../../backend/domains/task/endpoints/create-task.md
- EP-TASK-03 PATCH /api/tasks/:id (validates `tagIds`, resolves the answer's tags) — ../../backend/domains/task/endpoints/update-task.md

## Used by Features

- FEAT-TAG-01 Personal tag library
- FEAT-TAG-02 Manage tags
- FEAT-TAG-03 Tag tasks from the task list
- FEAT-TAG-04 Filter the task list by tag

## Data Classification / Retention

- Personal data: a tag name is the user's own free text, private to the owner, shown only as plain text (DATA-008, BR-046). Never logged. Deleted only by the owner through EP-TAG-04; no retention rule. Backup: follows `tasks` and `users` (FEAT-PLAT-03, ASM-022); a restore that brings back tasks must also bring back tags, which a single backup of the database does.

## Open Questions

- None for the entity. The shade of each colour in light and dark (OQ-TAG-01) is a frontend token question and is carried on PAGE-TASK-01.

## Source References

- Feature: FEAT-TAG-01, FEAT-TAG-02, FEAT-TAG-03, FEAT-TAG-04
- Data register: DATA-008, DATA-009
- Business rules: BR-040 to BR-044, BR-046
- Decisions: DEC-256, DEC-257, DEC-259, DEC-260, DEC-261, DEC-262, DEC-263
- Risk: R-12
- [code › src/models/Tag.ts:36]
- [test › tests/unit/tagModel.test.ts]
- Task: Task-29 Tag tasks from the task list (reads: `requireOwnedTags` and `tagsForTasks` in src/services/tags.ts)
- Test: tests/unit/tagsLookup.test.ts
- Test: tests/integration/tasks.tags.integration.test.ts
- Task: Task-31 Filter the task list by tag (reads: `ownsTag` in src/services/tags.ts confirms a filtered tag id is the caller's)
- Task: Task-33 Manage tags (rename, recolour and delete through EP-TAG-03 and EP-TAG-04; the delete pulls the id from `tasks.tagIds` first)
- Code: src/services/tags.ts:139
- Test: tests/integration/tags.update-delete.integration.test.ts
- Test: tests/integration/tags.update-delete.concurrency.integration.test.ts
