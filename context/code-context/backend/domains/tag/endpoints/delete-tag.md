---
doc_type: endpoint
schema_version: 1.1
produced_by: tl
endpoint_id: EP-TAG-04
method: DELETE
path: /api/tags/:id
match_key: 'DELETE /api/tags/:P'
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
mapped_from_line: 46
---

# Endpoint: Delete Tag

## Endpoint ID

EP-TAG-04

## Status

Designed

## Method + Path

DELETE /api/tags/:id

## Domain

Tag

## Purpose

Delete one of the user's own tags and remove it from every task that carries it; the tasks are neither changed nor deleted and keep their other tags (TAGM-UC-02, TAGM-FR-07, BR-044).

## Trigger

Called by page(s) — see Called by.

## Request

Path param `id` only. No body.

## Response

- `204 No Content`
- `401` no valid session
- `404` "not found" for a malformed id, an unknown id and another user's id, identically (DEC-259, BR-046)
- Response shape: Assumed

## Auth

Requires a valid session; every write is filtered by owner.

## Behaviour / Business Rules

- Order: session, path id (404), then the cascade, then the answer. The panel changes the screen only after the 204 (BR-7 of FEAT-TAG-02).
- The cascade is two owner-filtered steps in this order: `updateMany({ ownerId, tagIds: id }, { $pull: { tagIds: id } })` on tasks, then `deleteOne({ _id, ownerId })` on tags. If the second step matches nothing the answer is 404 (a concurrent delete won). Order matters: removing the links first means a failure part-way leaves a tag that still exists (retryable), never a task pointing at a deleted tag (DEC-262).
- A task create or update that validated this tag just before it was deleted can still write the id afterwards. Readers resolve a task's `tagIds` against the tags collection and skip an id with no tag, so a stray id never shows and never counts (DEC-262).
- Tasks are never deleted or otherwise modified: only `tagIds` and `updatedAt` are touched on the tasks that carried the tag.
- The N shown in the panel's delete question comes from EP-TAG-01 (read just before the question), not from this endpoint.

## Called by

- PAGE-TASK-01 Task List — ../../../../../../../frontend/context/code-context/frontend/pages/task/task-list.md

## Reads / Writes Entities

- Writes (deletes) tags — ../../../../database/entities/tags.md (ENT-TAG-01)
- Writes tasks (`$pull` of the tag id from `tagIds`) — ../../../../database/entities/tasks.md (ENT-TASK-01)
- Reads sessions (via requireSession) — ../../../../database/entities/sessions.md (ENT-AUTH-02)

## Used by Features

- FEAT-TAG-02 Manage tags

## Integrations

- None.

## Open Questions

- None.

## Source References

- Feature: FEAT-TAG-02 (AC-4, AC-5, AC-8, AC-13 to AC-15, AC-17, AC-18, AC-19)
- Workflow: WF-010
- Business rules: BR-044, BR-046, BR-050
- Data: DATA-008, DATA-009
- Decisions: DEC-259, DEC-260, DEC-262
- Risk: R-11 (a later bulk delete route needs no tag cleanup for the tasks it removes, because the link lives on the task; a tag delete needs the `$pull`)
- [code › src/routes/tags.ts:46]
- [code › src/services/tags.ts:167]
- [code › src/lib/tagId.ts]
- [test › tests/integration/tags.update-delete.integration.test.ts]
- [test › tests/integration/tags.update-delete.concurrency.integration.test.ts]
- [test › tests/contracts/tags.update-delete.contract.test.ts]
- [test map › context/test-map/task-tags.md]
