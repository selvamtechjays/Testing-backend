// tier: unit
// requires: nothing (reads the committed README from disk)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
// Matched on whitespace-collapsed text so re-wrapping a paragraph or re-padding a table does not break a check.
const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8').replace(/\s+/g, ' ');

describe('README documents the hardening (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-8)', () => {
  it('lists RATE_LIMITED among the error codes', () => {
    expect(readme).toMatch(/`RATE_LIMITED` \(HTTP 429/);
  });

  it('has a Security and logging section with headers, request id, log level and proxy hops', () => {
    expect(readme).toMatch(/## Security and logging/);
    expect(readme).toMatch(/`X-Request-Id`/);
    expect(readme).toMatch(/`LOG_LEVEL`/);
    expect(readme).toMatch(/`TRUST_PROXY_HOPS`/);
    expect(readme).toMatch(/standard `helmet` header set/);
  });

  it('states the limits and the single-instance caveat', () => {
    expect(readme).toMatch(/10 sign-in attempts per client address per 15 minutes/);
    expect(readme).toMatch(/5 failed sign-ins per username per 15 minutes/);
    expect(readme).toMatch(/5 registrations per client address per hour/);
    expect(readme).toMatch(/2 password hashes run at once with 8 waiting/);
    expect(readme).toMatch(/not shared between instances/);
  });

  it('no longer claims there is no rate limit', () => {
    expect(readme).not.toMatch(/no lockout, attempt counter or rate limit/i);
  });

  it('lists the four tag routes', () => {
    expect(readme).toMatch(/\| GET \| `\/api\/tags` \|/);
    expect(readme).toMatch(/\| POST \| `\/api\/tags` \|/);
    expect(readme).toMatch(/\| PATCH \| `\/api\/tags\/:id` \|/);
    expect(readme).toMatch(/\| DELETE \| `\/api\/tags\/:id` \|/);
  });

  it('documents the tag fields on tasks', () => {
    expect(readme).toMatch(/## Tags/);
    expect(readme).toMatch(/`tags: \[ \{ "id", "name", "colour" \} \]`/);
    expect(readme).toMatch(/`tagIds`/);
    expect(readme).toMatch(/`GET \/api\/tasks\?tag=<id>\|none`/);
  });
});
