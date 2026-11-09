# Testing-backend — Testing-Delivery-os API

Node 22 + Express 5 + TypeScript REST API, backed by MongoDB through Mongoose.

## Requirements

- Node.js >= 22, npm >= 10
- A MongoDB connection string in `.env` (`MONGODB_URI`) — the team uses MongoDB Atlas. Only `npm run dev` / `start` need it; tests do not. `.env` is gitignored and loaded automatically.

## Setup

```bash
npm install
cp .env.example .env   # set PORT, MONGODB_URI
```

## Scripts

| Command                           | What it does                                           |
| --------------------------------- | ------------------------------------------------------ |
| `npm run dev`                     | Run `src/server.ts` with tsx in watch mode (port 4000) |
| `npm run build`                   | Compile `src/` to `dist/`                              |
| `npm start`                       | Run the compiled server                                |
| `npm run lint`                    | ESLint (zero warnings allowed)                         |
| `npm run format` / `format:check` | Prettier write / check                                 |
| `npm run typecheck`               | TypeScript, no emit                                    |
| `npm test`                        | Vitest + supertest                                     |
| `npm run test:coverage`           | Vitest with v8 coverage                                |

## Endpoints

| Method | Path                 | Purpose                                                        |
| ------ | -------------------- | -------------------------------------------------------------- |
| GET    | `/api/health`        | Liveness probe — `{ status, db }`                              |
| POST   | `/api/auth/register` | Public. Creates an account and signs the user in (see below)   |
| POST   | `/api/auth/login`    | Public. Signs in with username and password (see Sessions)     |
| POST   | `/api/auth/logout`   | Public. Ends the presented session; always `204`               |
| GET    | `/api/auth/me`       | Signed-in only. Returns `{ user: { id, username } }`           |
| GET    | `/api/tasks`         | Signed-in only. The caller's tasks, newest first (see Tasks)   |
| POST   | `/api/tasks`         | Signed-in only. Adds a pending task (see Tasks)                |
| PATCH  | `/api/tasks/:id`     | Signed-in only. Edits the title and/or status (see Tasks)      |
| DELETE | `/api/tasks/:id`     | Signed-in only. Deletes the caller's task for good (see Tasks) |

## Error responses

Every error, including an unmatched route, is JSON with exactly one top-level key:

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Validation failed",
    "fields": { "title": "Enter a title." }
  }
}
```

`fields` appears only for `VALIDATION`. Codes: `VALIDATION`, `BAD_REQUEST` (malformed or oversized JSON),
`UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `NOT_FOUND`, `USERNAME_TAKEN`, `SERVICE_UNAVAILABLE` (database
unreachable), `INTERNAL`. Throw `ApiError` for expected failures and use `parseBody(schema, req.body)` to
validate; unknown errors become a generic 500 with no internals.

## Layout

```
src/
  server.ts               entry: config → Mongo → listen
  app.ts                  createApp(deps) — testable Express app
  config/env.ts           the only reader of process.env
  db/mongo.ts             Mongoose connection lifecycle
  lib/apiError.ts         ApiError(status, code, message, fields?)
  lib/parseBody.ts        zod body validation -> ApiError VALIDATION
  middleware/errorHandler.ts
  routes/health.ts
tests/
  app.test.ts
```

New resources: `src/routes/<resource>.ts` → `src/services/<resource>.ts` → `src/models/<Entity>.ts`.
Conventions are in the workspace's `.jetrix/shared-context/coding-standards.md` § backend.

## Account registration

`POST /api/auth/register` is public and takes `{ "username", "password" }`. A username is 3 to 30 letters, numbers
or underscores and is stored lower-cased; the unique index on `users.username` is the only duplicate guard, so
concurrent requests for one name create exactly one account (the loser gets `409 USERNAME_TAKEN`). A password is at
least 8 characters and not on the common-password list; no other rule applies. Success is `201 { "user": { "id",
"username" } }` plus a session cookie (`sid`: HttpOnly, SameSite=Lax, Path `/`, no Max-Age, `Secure` when
`NODE_ENV=production`). Refusals use the error envelope with every failing field in `fields`. A refused request
creates no user, session or cookie.

- **Password hashing:** Node `crypto.scrypt`, N=32768, r=8, p=3, 16-byte random salt per user, 64-byte key (OWASP
  recommended cost). Stored as `scrypt$N$r$p$<salt>$<hash>`, so the cost can be raised later without a migration.
- **Common-password list:** `src/auth/commonPasswords.ts`, about 150 entries of 8+ characters hand-compiled from the
  widely published most-used-password lists (SplashData, NordPass, NCSC). Case-insensitive match. It is a bundled
  subset, not a downloaded copy of a full published file; swap in a larger list there if the client names one.
- **Sessions:** `sessions` collection, SHA-256 hex of the 32-random-byte cookie value as `_id` (the raw token lives only in the cookie), `expiresAt` one day after
  creation with a TTL index. `server.ts` awaits `User.init()` and `Session.init()` so the unique and TTL indexes exist
  before the first request.

## Sign in, sign out and the session guard

- **Lifetime:** a session lasts one day from sign-in, fixed at creation. Activity never extends it and there is no
  Remember me. The cookie (`sid`: HttpOnly, SameSite=Lax, Path `/`, `Secure` in production) has no Max-Age or
  Expires, so the browser drops it when it closes. Behind a proxy, set Express `trust proxy` so `Secure` survives.
- **`POST /api/auth/login`:** `{ "username", "password" }`; the username is matched lower-cased and never trimmed.
  Success is `200 { "user": { "id", "username" } }` with a new session and cookie (a presented cookie is ignored;
  the user's other sessions stay valid). An unknown username and a wrong password return the same `401
INVALID_CREDENTIALS` body, and both run a scrypt comparison so timing does not tell them apart. There is no
  lockout, attempt counter or rate limit (accepted for a closed test).
- **`POST /api/auth/logout`:** deletes only the presented session and clears the cookie; always `204`, including
  for a missing, unknown or expired session.
- **`requireSession`** (`src/auth/index.ts`): protect a route with `createRequireSession({ clock })`. It hashes the
  cookie value, finds the session, treats `expiresAt <= now` as ended (and deletes the row), loads the user and
  sets `res.locals.user = { id, username }`. Every refusal is `401 UNAUTHENTICATED` "Not signed in.". The
  frontend reads any such 401 as the session having ended.

## Tasks

Both operations sit behind `requireSession` and are scoped to the signed-in user: the owner always comes from the
session, never from the request body, so one user can never read or change another user's tasks.

- **`GET /api/tasks`:** no parameters. Success is `200 { "tasks": [ { "id", "title", "status", "createdAt" } ] }`,
  `status` is `pending` or `completed`, newest first by `createdAt` with `id` descending as the tie-break; `[]` when the
  user has none. Completed tasks are always included. No pagination.
- **`POST /api/tasks`:** `{ "title" }`. The title is trimmed, then must be 1 to 200 characters (UTF-16 code units);
  whitespace-only counts as empty. Success is `201 { "task": { "id", "title", "status": "pending", "createdAt" } }`.
  Refusals are `400 VALIDATION` with `fields.title` set to "Enter a title." or "Titles can be at most 200
  characters." (the same text the screen shows, `src/lib/taskTitle.ts`). Any other body field (`status`, `ownerId`,
  notes, due date, priority) is dropped, not stored and not an error.
- **Storage:** `tasks` collection (`src/models/Task.ts`), compound index `{ ownerId: 1, createdAt: -1 }`; `server.ts`
  awaits `Task.init()` so it exists before the first request. Code: `src/routes/tasks.ts`, `src/services/tasks.ts`.
- **`PATCH /api/tasks/:id`:** body `{ "title"?, "status"? }` with at least one. `title` follows the add rule (trimmed, 1 to
  200 characters, whitespace-only is empty); `status` is `pending` (untick) or `completed` (tick). Success is `200 { "task": {
"id", "title", "status", "createdAt" } }`. One atomic write filtered by id and owner, so a task that is missing, has a
  malformed id, or belongs to another user is the same `404 NOT_FOUND` "Task not found." (the id is checked before the body).
  `400 VALIDATION` puts the message in `fields.title`, `fields.status` ("Status must be pending or completed") or
  `fields.body` ("Provide a title or a status") and leaves the stored task unchanged. `ownerId`, `createdAt` and any other
  key are stripped and never written, so a tick or edit never changes a task's place in the list. Setting the current status
  succeeds; a completed task's title may be edited. Code: `src/lib/taskUpdate.ts`, `updateTask` in `src/services/tasks.ts`.
- **`DELETE /api/tasks/:id`:** no body (any body is ignored). Success is `204` with no body. A hard delete in one atomic
  write filtered by id and owner: there is no trash, soft-delete flag or restore route. A missing, malformed or
  another user's id is the same `404 NOT_FOUND` "Task not found."; a repeat delete of the same id is also `404`. The
  5-second Undo window lives entirely in the client, which delays this call; the server never holds a deleted task.
  Code: `deleteTask` in `src/services/tasks.ts`.
