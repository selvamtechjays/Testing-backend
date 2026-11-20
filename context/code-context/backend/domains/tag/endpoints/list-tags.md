---
doc_type: endpoint
schema_version: 1.1
produced_by: tl
endpoint_id: EP-TAG-01
method: GET
path: /api/tags
match_key: 'GET /api/tags'
status: Active
implementation_state: Implemented
origin: implemented
design_confidence: Confirmed
generated_at: 2026-11-20
implemented_by_commit: pending
mapped_from_commit: pending
implemented_at: 2026-11-20T10:56:43Z
implemented_by_task: FEAT-TAG-01
mapped_from: src/routes/tags.ts
mapped_from_line: 24
---

# Endpoint: List My Tags

## Endpoint ID

EP-TAG-01

## Status

Designed

## Method + Path

GET /api/tags

## Domain

Tag

## Purpose

Return the signed-in user's own tags, each with the number of the user's own tasks that carry it (TAGM-FR-01, TAGM-FR-10). It is the one read behind the Tag filter, the task picker and the Manage tags panel, and the source of the "N tasks" in the delete question (read again just before that question is shown).

## Trigger

Called by page(s) — see Called by.

## Request

No query, no body. Any query key is ignored (same simple query parser as EP-TASK-01).

## Response

- `200 OK` → `{ tags: [ { id, name, colour: "gray" | "red" | "orange" | "green" | "blue" | "purple", taskCount: number } ] }`, sorted by name ignoring case (ties by id ascending). An empty array for a user with no tags. `taskCount` is worked out when asked and never stored: the number of the owner's tasks whose `tagIds` hold the tag, a task waiting out its Undo window included until it is really deleted (ASM-061).
- `401` no valid session (existing envelope)
- Response shape: Assumed (DEC-259 settles the refusals, not the success body)

## Auth

Requires a valid session; results are scoped to the session user, taken from the session and never from the request (BR-040).

## Behaviour / Business Rules

- Only tags whose `ownerId` is the session user are returned; another user's tag is never listed or counted (AC-16).
- taskCount comes from one aggregation over the owner's tasks (`$match` ownerId and tagIds, `$unwind` tagIds, `$group` by tag) joined in memory to the owner's tags, so a tag with no task reports 0 and no per-tag query is made (DEC-263).
- The list is not paginated: at most 50 tags per user (BR-043).
- Sorting uses the same case-insensitive collation as the name index (DEC-261), so the order the user sees matches the uniqueness rule.

## Called by

- PAGE-TASK-01 Task List — ../../../../../../../frontend/context/code-context/frontend/pages/task/task-list.md

## Reads / Writes Entities

- Reads tags — ../../../../database/entities/tags.md (ENT-TAG-01)
- Reads tasks (taskCount) — ../../../../database/entities/tasks.md (ENT-TASK-01)
- Reads sessions (via requireSession) — ../../../../database/entities/sessions.md (ENT-AUTH-02)

## Used by Features

- FEAT-TAG-01 Personal tag library
- FEAT-TAG-02 Manage tags
- FEAT-TAG-03 Tag tasks from the task list
- FEAT-TAG-04 Filter the task list by tag

## Integrations

- None.

## Open Questions

- None.

## Source References

- Feature: FEAT-TAG-01 (AC-3, AC-4, AC-12, AC-16), FEAT-TAG-02 (AC-1, AC-17), FEAT-TAG-03, FEAT-TAG-04
- Workflow: WF-010, WF-011
- Business rules: BR-040, BR-041, BR-043, BR-046
- Data: DATA-008, DATA-009
- Decisions: DEC-259, DEC-260, DEC-261, DEC-263
- Assumptions: ASM-048, ASM-055, ASM-061
- [code › src/routes/tags.ts:24]
- [code › src/services/tags.ts (listTags)]
- [test › tests/integration/tags.list-and-create.integration.test.ts]
- [test › tests/contracts/tags.list-and-create.contract.test.ts]
- [test map › context/test-map/task-tags.md]
