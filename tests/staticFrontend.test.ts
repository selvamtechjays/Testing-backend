// tier: unit
// requires: nothing external (a real temp directory on disk and the exported app driven by supertest; no DB, no network)
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { createApp } from '../src/app.js';

const INDEX_HTML = '<!doctype html><title>TaskNest</title><div id="root"></div>';
const ASSET_JS = 'console.warn("asset");';
let distDir: string;

beforeAll(() => {
  distDir = mkdtempSync(path.join(tmpdir(), 'tasknest-dist-'));
  writeFileSync(path.join(distDir, 'index.html'), INDEX_HTML);
  mkdirSync(path.join(distDir, 'assets'));
  writeFileSync(path.join(distDir, 'assets', 'app.js'), ASSET_JS);
});

afterAll(() => {
  rmSync(distDir, { recursive: true, force: true });
});

function appWithFrontend() {
  return createApp({ isDbConnected: () => true, frontendDistDir: distDir });
}

describe('a dist directory under a dot-named parent (regression for sendFile dotfile refusal)', () => {
  it('still serves index.html for the root and a client route', async () => {
    const dotParent = mkdtempSync(path.join(tmpdir(), 'tasknest-dot-'));
    const dotDist = path.join(dotParent, '.build', 'dist');
    mkdirSync(dotDist, { recursive: true });
    writeFileSync(path.join(dotDist, 'index.html'), INDEX_HTML);
    try {
      const app = createApp({ isDbConnected: () => true, frontendDistDir: dotDist });
      const root = await request(app).get('/').expect(200);
      expect(root.text).toBe(INDEX_HTML);
      const route = await request(app).get('/signin').expect(200);
      expect(route.text).toBe(INDEX_HTML);
    } finally {
      rmSync(dotParent, { recursive: true, force: true });
    }
  });
});

describe('built frontend served beside the API (FEAT-PLAT-03, AC-1)', () => {
  it('serves index.html at the root', async () => {
    const res = await request(appWithFrontend()).get('/').expect(200);
    expect(res.text).toBe(INDEX_HTML);
  });

  it('serves an existing built file as itself', async () => {
    const res = await request(appWithFrontend()).get('/assets/app.js').expect(200);
    expect(res.text).toBe(ASSET_JS);
  });

  it('falls back to index.html for a client-side route', async () => {
    const res = await request(appWithFrontend()).get('/signin').expect(200);
    expect(res.text).toBe(INDEX_HTML);
  });

  it('keeps unknown API paths on the JSON not-found envelope, never index.html', async () => {
    const res = await request(appWithFrontend()).get('/api/nope').expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  it.each(['/API/nope', '/Api/nope', '/API'])(
    'keeps %s on the JSON not-found envelope whatever its case, never index.html',
    async (apiPath) => {
      const res = await request(appWithFrontend()).get(apiPath).expect(404);
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    },
  );

  it('keeps the bare API prefix on the JSON not-found envelope', async () => {
    const res = await request(appWithFrontend()).get('/api').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('still answers the deploy health probe without a session', async () => {
    const res = await request(appWithFrontend()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });

  it('does not answer a non-GET outside the API with index.html', async () => {
    const res = await request(appWithFrontend()).post('/signin').send({}).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('answers the JSON 404 (not a 500) when index.html is missing', async () => {
    const emptyDir = mkdtempSync(path.join(tmpdir(), 'tasknest-empty-'));
    try {
      const app = createApp({ isDbConnected: () => true, frontendDistDir: emptyDir });
      const res = await request(app).get('/signin');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('registers no static handler when no directory is configured', async () => {
    const res = await request(createApp({ isDbConnected: () => true }))
      .get('/')
      .expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
});

describe('proxy trust (FEAT-PLAT-03, AC-1)', () => {
  it('trusts one proxy hop when enabled', () => {
    const app = createApp({ isDbConnected: () => true, trustProxy: true });
    expect(app.get('trust proxy')).toBe(1);
  });

  it('does not trust a proxy by default', () => {
    const app = createApp({ isDbConnected: () => true });
    expect(app.get('trust proxy')).toBeFalsy();
  });
});

describe('loadConfig FRONTEND_DIST_DIR', () => {
  it('reads the built-frontend directory', () => {
    expect(loadConfig({ FRONTEND_DIST_DIR: './frontend-dist' }).frontendDistDir).toBe(
      './frontend-dist',
    );
  });

  it('treats an unset or empty value as no frontend', () => {
    expect(loadConfig({}).frontendDistDir).toBeUndefined();
    expect(loadConfig({ FRONTEND_DIST_DIR: '' }).frontendDistDir).toBeUndefined();
  });
});
