<!-- delivery-os:code-context -->

## Code context

This repo has a context graph. `context/code-context/code-context-index.md` is the entry point.

Resolve any page, endpoint or database object through **layer index → the matching row → that unit
file** — two reads. Do not grep the repo for a surface the index already names.

Units carry `implementation_state`: `Implemented` is as-built, `Planned` is not written yet.
<!-- /delivery-os:code-context -->

## Tests

Coverage per feature lives in `context/test-map/<feature-slug>.md`. Each row is a
scenario with the exact command to run it on its own, what it needs running, and
which fixtures it uses. Read the map before writing a new test — the fixture you
need probably exists.
