import path from 'node:path';
import express, { Router } from 'express';
import { ApiError } from '../lib/apiError.js';

/**
 * True when the request path is the API prefix itself or sits under it. Case-insensitive, because the
 * router matches API paths that way: `/API/nope` must get the JSON 404, never the frontend shell.
 */
function isApiPath(requestPath: string, apiPrefix: string): boolean {
  const lowered = requestPath.toLowerCase();
  const prefix = apiPrefix.toLowerCase();
  return lowered === prefix || lowered.startsWith(`${prefix}/`);
}

/**
 * Serves the built frontend from `distDir` so the API and the UI share one origin (DEC-051, DEC-080).
 * Files that exist are served as-is; any other GET/HEAD outside the API prefix gets `index.html` so the
 * client-side router can handle deep links. Paths under the API prefix are never answered here. A missing
 * `index.html` is the standard JSON 404, not a 500.
 */
export function createStaticFrontend(distDir: string, apiPrefix: string): Router {
  const root = path.resolve(distDir);
  const router = Router();
  const serveFiles = express.static(root);
  router.use((req, res, next) => {
    if (isApiPath(req.path, apiPrefix)) {
      next();
      return;
    }
    serveFiles(req, res, next);
  });
  router.get(/.*/, (req, res, next) => {
    if (isApiPath(req.path, apiPrefix)) {
      next();
      return;
    }
    res.sendFile(path.join(root, 'index.html'), (err) => {
      if (!err) return;
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT';
      next(missing ? new ApiError(404, 'NOT_FOUND', 'Not found') : err);
    });
  });
  return router;
}
