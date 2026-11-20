---
doc_type: endpoint
schema_version: 1.1
produced_by: tl
endpoint_id: EP-TAG-02
method: POST
path: /api/tags
match_key: 'POST /api/tags'
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
mapped_from_line: 27
---

# Endpoint: Create Tag

## Endpoint ID

EP-TAG-02

## Status

Designed

## Method + Path

POST /api/tags

## Domain

Tag

## Purpose

Create one tag for the signed-in user (TAGM-FR-02). The only creation route in the product is the Create tag field in a task's picker (FEAT-TAG-03, TAGT-UC-02); Manage tags has no Create control.

## Trigger

Called by page(s) — see Called by.

## Request

| Field  | Type   | Required | Notes                                                                                                                                                         | Confidence                                     |
| ------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| name   | string | yes      | plain text; trimmed at the ends only; 1 to 30 UTF-16 code units after the trim (the task-title rule, so an emoji counts as two); stored and returned as typed | Confirmed (BR-041); counting Assumed (ASM-043) |
| colour | string | no       | one of `gray`, `red`, `orange`, `green`, `blue`, `purple`; `gray` when omitted                                                                                | Confirmed (BR-042)                             |

The owner is taken from the session; any `ownerId` in the body is stripped (BR-040).

## Response

- `201 Created` → `{ tag: { id, name, colour, taskCount: 0 } }` (ASM-042)
- `400 VALIDATION` → `fields.name` for an empty, whitespace-only, missing, over-30, duplicate (ignoring case) name and for the 51st tag; `fields.colour` for a colour outside the six. Nothing is created. Messages are Assumed (build chooses the wording; a duplicate and the 51st tag each get their own).
- `401` no valid session
- Response shape: Assumed

## Auth

Requires a valid session; the tag's owner is the session user.

## Behaviour / Business Rules

- Names are unique per user ignoring case across all letters, accented and non-Latin included ("Café" equals "café"); two users may each hold "Work" (BR-040, ASM-067).
- A user holds at most 50 tags; the 51st is refused naming `name` (BR-043, DEC-259).
- Both limits are enforced where the data is stored, not only in the request check, so two simultaneous creates cannot both succeed where only one fits (R-12, BR-8, AC-14, AC-15): a unique case-insensitive index on owner and name, and a unique owner and slot index with slots 0 to 49 (DEC-261). A duplicate-key refusal on the name index answers as a duplicate name; one on the slot index retries with the next free slot a bounded number of times, then answers as the 51st tag.
- Markup in a name is stored and returned as literal text; the client renders it as text only (AC-13).
- Create-or-tick ("a name that matches ignoring case ticks the existing tag") is the client's job (BR-9 of FEAT-TAG-03); this endpoint always refuses a duplicate.

## Called by

- PAGE-TASK-01 Task List — ../../../../../../../frontend/context/code-context/frontend/pages/task/task-list.md

## Reads / Writes Entities

- Writes tags — ../../../../database/entities/tags.md (ENT-TAG-01)
- Reads sessions (via requireSession) — ../../../../database/entities/sessions.md (ENT-AUTH-02)

## Used by Features

- FEAT-TAG-01 Personal tag library
- FEAT-TAG-03 Tag tasks from the task list

## Integrations

- None.

## Open Questions

- None.

## Source References

- Feature: FEAT-TAG-01 (AC-1, AC-2, AC-5 to AC-16), FEAT-TAG-03 (AC-7, AC-8, AC-17, AC-18, AC-20, AC-23, AC-24)
- Workflow: WF-011
- Business rules: BR-040 to BR-043, BR-046
- Data: DATA-008
- Decisions: DEC-259, DEC-261
- Assumptions: ASM-041, ASM-042, ASM-043, ASM-067; risk R-12
- [code › src/routes/tags.ts:27]
- [code › src/services/tags.ts (createTag)]
- [code › src/lib/tagFields.ts]
- [test › tests/integration/tags.list-and-create.integration.test.ts]
- [test › tests/integration/tags.concurrency.integration.test.ts]
- [test › tests/unit/tagFields.test.ts]
- [test › tests/contracts/tags.list-and-create.contract.test.ts]
- [test map › context/test-map/task-tags.md]
