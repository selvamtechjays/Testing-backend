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

| Method | Path          | Purpose                           |
| ------ | ------------- | --------------------------------- |
| GET    | `/api/health` | Liveness probe — `{ status, db }` |

## Layout

```
src/
  server.ts               entry: config → Mongo → listen
  app.ts                  createApp(deps) — testable Express app
  config/env.ts           the only reader of process.env
  db/mongo.ts             Mongoose connection lifecycle
  middleware/errorHandler.ts
  routes/health.ts
tests/
  app.test.ts
```

New resources: `src/routes/<resource>.ts` → `src/services/<resource>.ts` → `src/models/<Entity>.ts`.
Conventions are in the workspace's `.jetrix/shared-context/coding-standards.md` § backend.
