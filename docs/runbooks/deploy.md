# Runbook: deploy

Applies to the single web service described in `docs/decisions/hosting.md`.

## Settings

| Setting             | Value                                   | Where it is set                  |
| ------------------- | --------------------------------------- | -------------------------------- |
| Runtime             | Node 22                                 | `deploy/render.yaml`             |
| Build command       | `npm ci --include=dev && npm run build` | `deploy/render.yaml`             |
| Start command       | `npm start`                             | `deploy/render.yaml`             |
| Health check path   | `/api/health` (expects `200`)           | `deploy/render.yaml`             |
| `NODE_ENV`          | `production`                            | `deploy/render.yaml`             |
| `PORT`              | provided by the platform                | platform                         |
| `MONGODB_URI`       | the Atlas connection string             | provider dashboard, never in git |
| `FRONTEND_DIST_DIR` | directory holding the built frontend    | `deploy/render.yaml`             |

The build command installs devDependencies on purpose: the platform exposes `NODE_ENV=production` at build
time, a plain `npm ci` would then skip them, and `tsc` would be missing.

With `NODE_ENV=production` the app trusts `TRUST_PROXY_HOPS` proxy hops (default 1) and sets `Secure`, `HttpOnly`, `SameSite=Lax` on
the session cookie. There is no CORS: the UI and the API share one origin. Sessions are opaque server-side
ids stored hashed (DEC-093), so no session signing secret exists to configure.

## Frontend build output

The service serves whatever is in `FRONTEND_DIST_DIR`. Human/infra: publish the output of the frontend
repository's `npm run build` into that directory as part of the deploy. How it gets there (a build step that
fetches the frontend repository, or a copy of the built files) is a TL decision not yet recorded; until it
is made the service serves the API only.

Open item (TL / frontend deploy): the blueprint sets `FRONTEND_DIST_DIR` but nothing in it builds or
provides that directory yet.

Security: express serves the directory as-is and follows symlinks. It must hold build output only, and no
untrusted party may have write access to it.

## Proxy trust

The per-address sign-in and register limits key on the client address, so the app must read it correctly.
`TRUST_PROXY_HOPS` is the number of reverse proxies in front of the service whose `X-Forwarded-For` entry is
trusted (default 1 when `NODE_ENV=production`, 0 otherwise). Render puts one proxy in front of the service, so
the default is 1; this is provisional until checked against the deployed host (DEC-306).

- Too high: a client can send its own `X-Forwarded-For` and dodge the per-address limit.
- Too low: every client looks like the proxy and all users share one limit.
- A wrong value is fixed by changing the setting and restarting, not by a code change.

Verify once per host, and again if the provider or a CDN in front of it changes. The app does not log the
client address, so check it from outside with `POST /api/auth/login` and an empty body (each call counts
against the per-address limit of 10 per 15 minutes):

1. Not too high: send 11 requests from one machine, each with a different forged header
   `X-Forwarded-For: 203.0.113.N` (N = 1 to 11). A `429` on the 11th means the forged values are ignored and
   the count is not too high. If none of the 11 is refused, the count is too high: lower it and restart.
2. Not too low: wait out the window (or use fresh addresses), then send 11 requests from each of two real
   networks (for example your office and a phone hotspot). Each network must be refused on its own 11th
   request. If the second network is refused sooner because of the first, every client looks like the proxy
   and the count is too low: raise it and restart.

Record the result:

| Date                                                  | Host | Verified hop count | Method | Checked by |
| ----------------------------------------------------- | ---- | ------------------ | ------ | ---------- |
| _to be filled in by whoever checks the deployed host_ |      |                    |        |            |

## After each deploy

1. Open the service URL; the sign-in page loads.
2. `GET /api/health` returns `200` with `db: connected`.
3. Register a throwaway account, then sign out and sign in again. A failure here usually means the cookie
   or proxy settings above are wrong.

## Rollback

Redeploy the previous release from the provider dashboard. To add, inspect or undo an index or a data change,
follow `docs/runbooks/index-and-data-changes.md`.
