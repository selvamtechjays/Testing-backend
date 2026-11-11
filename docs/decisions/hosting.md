# Decision: hosting

Status: proposed, awaiting TL confirmation of provider and cost (DEC-070, DEC-080).

## Choice

TaskNest runs as one small PaaS web service (Render, Railway or Fly class). The service runs the
backend and serves the built frontend from the same origin, so the session cookie works without CORS or
cross-site cookies (DEC-051). The database stays on the existing MongoDB Atlas cluster (DEC-011).

- Provisional provider: Render. The blueprint is `deploy/render.yaml`; another provider only needs the same
  settings translated.
- Plan: one web service, the smallest paid instance type.
- Runtime: Node 22, build `npm ci --include=dev && npm run build` (devDependencies are needed for `tsc` and `NODE_ENV=production` would skip them), start `npm start`, health check `/api/health`.
- The client has no hosting preference and no monthly cost ceiling (BR-1, ASM-010).

## Expected monthly cost

| Item                                  | Monthly cost (USD) | Source                |
| ------------------------------------- | ------------------ | --------------------- |
| PaaS web service (one small instance) | TBC by TL          | provider pricing page |
| MongoDB Atlas (existing cluster)      | TBC by TL          | Atlas pricing page    |
| Atlas tier upgrade for Cloud Backup   | TBC by TL (if any) | Atlas pricing page    |
| **Expected monthly total**            | **TBC by TL**      |                       |

The TL fills the cells from current provider pricing, dated, before this record is final. Any Atlas tier
cost needed for backups (see `docs/decisions/backups.md`) is added to the total.

## Not promised

No uptime SLA and no recovery-time or recovery-point target applies in v1 (BR-4).

## Changes

Any later change to hosting is recorded as a new decision that supersedes this one.
