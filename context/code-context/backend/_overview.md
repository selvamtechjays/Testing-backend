---
doc_type: layer-overview
schema_version: 1.1
produced_by: tl
layer: backend
generated_at: 2026-11-06
---

# Backend Overview

## Stack

Node >= 22, Express 5, TypeScript 5.8 (ESM/NodeNext), Mongoose 9 over MongoDB Atlas (DEC-003, DEC-004, DEC-006, DEC-011).

## Conventions

All routers are mounted under `/api` (`API_PREFIX` in `src/app.ts`). Paths in endpoint units are written in full (`/api/...`). Domain folders under `src/` follow the unit domains (`auth`, `task`). Errors use the single HttpError paradigm in `src/middleware/errorHandler.ts`. JSON bodies only.

## Entry Points

`src/app.ts` createApp(deps); `src/server.ts`; existing scaffold route GET /api/health (scaffold only, not a feature unit, not mapped here).

## Notes

- Auth model (design assumption, OQ-SCAF-002 / CON-005): server-side sessions stored in MongoDB, referenced by an opaque id in an HttpOnly, SameSite=Lax session cookie with no Max-Age (ends when the browser closes); the server also expires a session 1 day after creation (BR-004). Not JWT. Confidence: Assumed.
- A cross-cutting `requireSession` middleware (not a unit) resolves the cookie to a user for every endpoint except register and login; it answers 401 on a missing, unknown or expired session.
- Same-origin deployment of Web and API is assumed (dev: Vite proxy, DEC-010); production topology depends on hosting (OQ-SCAF-001).
- Error body shape (design assumption): { error: { code, message, fields? } }.
- Ownership: task endpoints always scope by the session user; another user's task id answers 404 (BR-025).
- Cross-repo links in unit files assume the frontend and backend repos are sibling checkouts; every link is also keyed by unit ID.
