// tier: unit
// requires: nothing (reads the committed runbooks from disk)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = (relative: string): string =>
  readFileSync(path.join(ROOT, relative), 'utf8').replace(/\s+/g, ' ');

const runbook = read('docs/runbooks/index-and-data-changes.md');
const deploy = read('docs/runbooks/deploy.md');

describe('index and data change runbook (AC-9)', () => {
  it('explains how to add an index: declared in the model and built by init at boot', () => {
    expect(runbook).toMatch(/## Add/);
    expect(runbook).toMatch(/Declare the index in the model/i);
    expect(runbook).toMatch(/`Model\.init\(\)`/);
    expect(runbook).toMatch(/unique index does to data that is already there/i);
  });

  it('explains the deploy order and the backward-compatible two-step data change', () => {
    expect(runbook).toMatch(/## Deploy order/);
    expect(runbook).toMatch(/## Data changes: two backward-compatible steps/);
    expect(runbook).toMatch(/\*\*Expand\.\*\*/);
    expect(runbook).toMatch(/\*\*Contract\.\*\*/);
  });

  it('shows how to inspect indexes with getIndexes', () => {
    expect(runbook).toMatch(/## Inspect/);
    expect(runbook).toMatch(/db\.tasks\.getIndexes\(\)/);
  });

  it('explains rollback: redeploy the previous release, drop the added index by name, reverse the script', () => {
    expect(runbook).toMatch(/## Roll back/);
    expect(runbook).toMatch(/Redeploy the previous release/i);
    expect(runbook).toMatch(/db\.tasks\.dropIndex\('ownerId_1_createdAt_-1'\)/);
    expect(runbook).toMatch(/reverse script/i);
  });

  it('uses the task owner index and the unique username index as its worked examples', () => {
    expect(runbook).toMatch(/`{ ownerId: 1, createdAt: -1 }`/);
    expect(runbook).toMatch(/unique `username` index/);
  });
});

describe('deploy runbook links the procedure and records proxy trust (AC-9, DEC-306)', () => {
  it('links the index and data change runbook from Rollback', () => {
    expect(deploy).toMatch(/## Rollback.*index-and-data-changes\.md/);
  });

  it('documents TRUST_PROXY_HOPS and where the verified hop count is recorded', () => {
    expect(deploy).toMatch(/## Proxy trust/);
    expect(deploy).toMatch(/`TRUST_PROXY_HOPS`/);
    expect(deploy).toMatch(/Verified hop count/i);
  });
});
