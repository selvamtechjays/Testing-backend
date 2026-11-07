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

| Method | Path                 | Purpose                                                      |
| ------ | -------------------- | ------------------------------------------------------------ |
| GET    | `/api/health`        | Liveness probe — `{ status, db }`                            |
| POST   | `/api/auth/register` | Public. Creates an account and signs the user in (see below) |

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
