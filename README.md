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

| Method | Path                 | Purpose                                                            |
| ------ | -------------------- | ------------------------------------------------------------------ |
| GET    | `/api/health`        | Liveness probe — `{ status, db }`                                  |
| POST   | `/api/auth/register` | Public. Creates an account and signs the user in (see below)       |
| POST   | `/api/auth/login`    | Public. Signs in with username and password (see Sessions)         |
| POST   | `/api/auth/logout`   | Public. Ends the presented session; always `204`                   |
| GET    | `/api/auth/me`       | Signed-in only. Returns `{ user: { id, username } }`               |
| GET    | `/api/tasks`         | Signed-in only. The caller's tasks, newest first (see Tasks)       |
| POST   | `/api/tasks`         | Signed-in only. Adds a pending task (see Tasks)                    |
| PATCH  | `/api/tasks/:id`     | Signed-in only. Edits the title and/or status (see Tasks)          |
| DELETE | `/api/tasks/:id`     | Signed-in only. Deletes the caller's task for good (see Tasks)     |
| GET    | `/api/tags`          | Signed-in only. The caller's tags with task counts (see Tags)      |
| POST   | `/api/tags`          | Signed-in only. Creates a tag (see Tags)                           |
| PATCH  | `/api/tags/:id`      | Signed-in only. Renames and/or recolours a tag (see Tags)          |
| DELETE | `/api/tags/:id`      | Signed-in only. Deletes a tag and removes it from tasks (see Tags) |

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
`UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `NOT_FOUND`, `USERNAME_TAKEN`, `RATE_LIMITED` (HTTP 429, with a
`Retry-After` header), `SERVICE_UNAVAILABLE` (HTTP 503: database unreachable; the password-hash queue is full, with
`Retry-After: 5`; or a tag create lost repeated slot races under heavy concurrent creates, with no `Retry-After`, so
retry), `INTERNAL`. Throw `ApiError` for expected failures and use `parseBody(schema, req.body)` to
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
INVALID_CREDENTIALS` body, and both run a scrypt comparison so timing does not tell them apart. Attempts are
  rate limited; see Security and logging.
- **`POST /api/auth/logout`:** deletes only the presented session and clears the cookie; always `204`, including
  for a missing, unknown or expired session.
- **`requireSession`** (`src/auth/index.ts`): protect a route with `createRequireSession({ clock })`. It hashes the
  cookie value, finds the session, treats `expiresAt <= now` as ended (and deletes the row), loads the user and
  sets `res.locals.user = { id, username }`. Every refusal is `401 UNAUTHENTICATED` "Not signed in.". The
  frontend reads any such 401 as the session having ended.

## Tasks

Both operations sit behind `requireSession` and are scoped to the signed-in user: the owner always comes from the
session, never from the request body, so one user can never read or change another user's tasks.

- **`GET /api/tasks`:** optional query `search` (title only), `status`, `priority`, `due` (`overdue`, `today`, `week`,
  `none`), `today` (`YYYY-MM-DD`, needed by some due filters), `sort` (`newest`, `due`, `priority`) and `tag` (see Tags on
  tasks); each must be a single value, and a bad value is `400 VALIDATION` naming the key. Success is
  `200 { "tasks": [ { "id", "title", "status", "createdAt", "dueDate", "priority", "notes", "tags" } ] }`, plus
  `overdueCount` when `today` was sent (fields per `TaskDto` in `src/services/tasks.ts`),
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

## Tags

Tags are per user: every route sits behind `requireSession`, the owner comes from the session and never from the body, and
another user's tag is never listed, counted or changed. Code: `src/routes/tags.ts`, `src/services/tags.ts`,
`src/lib/tagFields.ts`, `src/models/Tag.ts`; `server.ts` awaits `Tag.init()` so the indexes exist before the first request.

- **Name rule:** trimmed at the ends only, then 1 to 30 characters (UTF-16 code units, so an emoji counts as two); stored and
  returned as typed. Unique per user ignoring case, accented and non-Latin letters included; two users may each hold "Work".
- **Colour:** one of `gray`, `red`, `orange`, `green`, `blue`, `purple`; `gray` when omitted on create.
- **Limit:** 50 tags per user; the 51st is refused as `400 VALIDATION` naming `name`. The name and count limits are enforced
  by unique indexes, so two simultaneous requests cannot both succeed where only one fits.
- **`GET /api/tags`:** no query or body. `200 { "tags": [ { "id", "name", "colour", "taskCount" } ] }`, sorted by name
  ignoring case (ties by id); `[]` when the user has none. `taskCount` is the number of the user's tasks carrying the tag,
  worked out on each read and never stored.
- **`POST /api/tags`:** `{ "name", "colour"? }`. Success is `201 { "tag": { "id", "name", "colour", "taskCount": 0 } }`.
  `400 VALIDATION` puts the message in `fields.name` (empty, missing, over 30, duplicate ignoring case, or the 51st tag) or
  `fields.colour`; nothing is created. `ownerId` and any other key are dropped. Under heavy concurrent creates for one
  user it can answer `503 SERVICE_UNAVAILABLE` "Could not save the tag right now. Please try again." (no `Retry-After`).
- **`PATCH /api/tags/:id`:** `{ "name"?, "colour"? }` with at least one (else `fields.body`); same rules as create. Success is
  `200 { "tag": { "id", "name", "colour", "taskCount" } }`. Changing only the letter case of the tag's own name is allowed. A
  malformed id is `404 NOT_FOUND` before the body is read; an unknown or another user's id is the same `404` once the body
  is valid (an invalid body is `400` first). Tasks are not written: they
  hold only the tag id, so every task shows the change.
- **`DELETE /api/tags/:id`:** no body. `204`. Removes the tag from every task that carries it, then deletes the tag; the
  tasks keep their other tags and are not deleted; only their tag list changes. A malformed, unknown or another user's id, and a repeat
  delete, is `404 NOT_FOUND`.

### Tags on tasks

- **`tags` on a task:** every task in the `GET`, `POST` and `PATCH` task responses carries `tags: [ { "id", "name",
"colour" } ]`, sorted by name ignoring case; `[]` when it has none, and for tasks stored before tags existed.
- **`tagIds` on `POST /api/tasks` and `PATCH /api/tasks/:id`:** an optional list of tag id strings. On update it replaces the
  task's tags; `[]` clears them; leaving it out changes nothing. Duplicates count once, a task holds at most 5 tags, and a
  sixth distinct id is `400 VALIDATION` naming `tagIds`. A malformed, unknown or another user's id is the same `400` naming
  `tagIds`, and nothing is saved (all or nothing). A `PATCH` with only `tagIds`, an empty list included, is a valid update.
- **`GET /api/tasks?tag=<id>|none`:** `tag` is a tag id (only tasks carrying it) or `none` (only tasks with no tags); a single
  value only. A malformed, unknown or another user's id, or a repeated `tag` key, is `400 VALIDATION` naming `tag`. Search
  stays title-only; tags are never searched.
- Deleting a task removes its tag links with it; the tags are untouched.

## Security and logging

- **Security headers:** every response, including static files, the JSON 404 and errors, carries the standard
  `helmet` header set and no `X-Powered-By`. `Strict-Transport-Security` is sent only in production (secure cookies on).
  No CORS headers are added: the UI and the API share one origin.
- **`X-Request-Id`:** every response carries it. A request may send its own; it is echoed back only if it matches
  `^[A-Za-z0-9._-]{1,128}$`, otherwise a UUID is generated. The id is in every log line for that request.
- **Logs:** JSON lines on stdout (pino). `LOG_LEVEL` sets the minimum level (`fatal`, `error`, `warn`, `info`, `debug`,
  `trace`, `silent`; default `info`). One access line per response (method, path without the query, status, duration,
  request id); an unhandled error logs its stack and request id and still answers `500 INTERNAL`. Passwords, cookies,
  session tokens and `Authorization` values are redacted, and request bodies and query strings are never logged.
- **Rate limits (`POST /api/auth/login`, `POST /api/auth/register`):** 10 sign-in attempts per client address per 15
  minutes; 5 failed sign-ins per username per 15 minutes, cleared by a successful one; 5 registrations per client address
  per hour. A refusal is `429 RATE_LIMITED` ("Too many attempts. Try again in a few minutes.") with `Retry-After` in
  seconds, identical whichever username is involved, and it happens before any password hashing. At most 2 password
  hashes run at once with 8 waiting; beyond that the answer is `503 SERVICE_UNAVAILABLE` with `Retry-After: 5`.
- **`TRUST_PROXY_HOPS`:** the number of reverse proxies in front of the app whose `X-Forwarded-For` entry is trusted to
  identify the client (default `1` in production, `0` otherwise). Too high lets a client forge its address; too low
  makes every client look like the proxy. Verify it against the host (see `docs/runbooks/deploy.md`).
- **Single instance:** limiter and gate state is in process memory, so counters reset on restart and are not shared
  between instances. Running more than one instance needs a shared store first (DEC-070, DEC-307).
