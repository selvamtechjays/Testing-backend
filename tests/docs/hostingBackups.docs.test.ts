// tier: unit
// requires: nothing (reads the committed decision records, runbooks and deploy blueprint from disk)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
// Prose is matched on whitespace-collapsed text, so re-wrapping a paragraph or re-padding a table does not
// break a check; the wording each check looks for is still required.
const read = (relative: string): string =>
  readFileSync(path.join(ROOT, relative), 'utf8').replace(/\s+/g, ' ');

const hosting = read('docs/decisions/hosting.md');
const backups = read('docs/decisions/backups.md');
const deployRunbook = read('docs/runbooks/deploy.md');
const backupRunbook = read('docs/runbooks/backup-restore.md');
const blueprint = read('deploy/render.yaml');

describe('hosting decision record (AC-1, AC-4, BR-1, BR-3)', () => {
  it('names the hosting choice and the existing database cluster', () => {
    expect(hosting).toMatch(/one small PaaS web service/i);
    expect(hosting).toMatch(/MongoDB Atlas/);
  });

  // AC-4 / TS-5 / NFR-Cost are only PARTIAL: the cost line exists, but its figures are still `TBC by TL`.
  // This test pins that honest state; it fails if the line vanishes, and a real figure replaces the marker
  // only when the TL confirms provider pricing (then tighten this to assert a dated figure).
  it('states an expected monthly cost line and marks it TBC until the TL confirms (AC-4 partial)', () => {
    expect(hosting).toMatch(/## Expected monthly cost/);
    expect(hosting).toMatch(/\*\*\s*Expected monthly total\s*\*\*\s*\|\s*\*\*\s*TBC by TL\s*\*\*/);
  });

  it('records that the client set no preference or ceiling', () => {
    expect(hosting).toMatch(/no hosting preference and no monthly cost ceiling/i);
  });
});

describe('backup decision record (AC-3, AC-6, BR-2, BR-3, BR-4)', () => {
  it('records mechanism, daily frequency and 7-day retention', () => {
    expect(backups).toMatch(/Atlas Cloud Backup/);
    expect(backups).toMatch(/\|\s*Frequency\s*\|\s*daily/i);
    expect(backups).toMatch(/\|\s*Retention\s*\|\s*7 days/i);
  });

  it('covers users and tasks and excludes sessions', () => {
    expect(backups).toMatch(/`users` and `tasks`/);
    expect(backups).toMatch(/Excluded\s*\|\s*`sessions`/);
  });

  it('promises no uptime, recovery-time or recovery-point target', () => {
    expect(backups).toMatch(/No uptime, recovery-time or recovery-point target in v1/i);
    expect(hosting).toMatch(/No uptime SLA and no recovery-time or recovery-point target/i);
  });
});

describe('backup runbook (AC-2, AC-5, AC-7, BR-2)', () => {
  it('documents the daily snapshot policy with 7-day retention', () => {
    expect(backupRunbook).toMatch(/one daily snapshot, retained for 7 days/i);
  });

  it('documents a failure alert with a recipient and a 24-hour follow-up', () => {
    expect(backupRunbook).toMatch(/Backup snapshot failed/i);
    expect(backupRunbook).toMatch(/team email address/i);
    expect(backupRunbook).toMatch(/24 hours/i);
  });

  it('shows a restore check that counts users and tasks and records the result', () => {
    expect(backupRunbook).toMatch(/Count the documents in `users` and `tasks`/i);
    expect(backupRunbook).toMatch(
      /\|\s*Date\s*\|\s*Snapshot id\s*\|\s*`users` count\s*\|\s*`tasks` count/i,
    );
  });

  it('restricts access to the same project members as production data', () => {
    expect(backupRunbook).toMatch(/limited to the Atlas project members/i);
  });
});

describe('deploy configuration (AC-1)', () => {
  it('uses the health probe, the production flag and the build and start commands', () => {
    expect(blueprint).toMatch(/healthCheckPath: \/api\/health/);
    expect(blueprint).toMatch(/key: NODE_ENV value: production/);
    expect(blueprint).toMatch(/buildCommand: npm ci .*&& npm run build/);
    expect(blueprint).toMatch(/startCommand: npm start/);
  });

  it('installs devDependencies in the build, because NODE_ENV=production would otherwise skip tsc', () => {
    expect(blueprint).toMatch(/buildCommand: npm ci --include=dev && npm run build/);
    expect(deployRunbook).toMatch(/npm ci --include=dev && npm run build/);
    expect(hosting).toMatch(/npm ci --include=dev && npm run build/);
  });

  it('flags that the frontend build output must still be provided (open item)', () => {
    expect(blueprint).toMatch(/FRONTEND_DIST_DIR/);
    expect(blueprint).toMatch(/frontend build output must be provided/i);
    expect(deployRunbook).toMatch(/open item/i);
  });

  it('never commits the database connection string', () => {
    expect(blueprint).toMatch(/key: MONGODB_URI sync: false/);
    expect(blueprint).not.toMatch(/mongodb(\+srv)?:\/\//);
  });

  it('is documented in the deploy runbook with a post-deploy sign-in check', () => {
    expect(deployRunbook).toMatch(/Register a throwaway account/i);
    expect(deployRunbook).toMatch(/`Secure`,\s*`HttpOnly`,\s*`SameSite=Lax`/);
  });
});
