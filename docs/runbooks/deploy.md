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

With `NODE_ENV=production` the app trusts one proxy hop and sets `Secure`, `HttpOnly`, `SameSite=Lax` on
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

`trust proxy` is fixed at 1 hop (Render puts one proxy in front of the service). Nothing reads `req.ip`
yet. Revisit the hop count before adding any rate limiting by IP, or a client could spoof its address.

## After each deploy

1. Open the service URL; the sign-in page loads.
2. `GET /api/health` returns `200` with `db: connected`.
3. Register a throwaway account, then sign out and sign in again. A failure here usually means the cookie
   or proxy settings above are wrong.

## Rollback

Redeploy the previous release from the provider dashboard. There is no data migration to undo.
