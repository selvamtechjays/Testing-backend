# Runbook: index and data changes

How to add, deploy, inspect and roll back a database index or a data change. Applies to the single MongoDB
database behind the service (`docs/decisions/hosting.md`). The worked examples are the two indexes that exist today: the per-owner task list index `{ ownerId: 1, createdAt: -1 }` in `src/models/Task.ts`, and the unique `username` index on `User` in `src/models/User.ts`, which is the only guard against duplicate accounts.

## Add

1. Declare the index in the model, never in a one-off script. For the task list index that is
   `taskSchema.index({ ownerId: 1, createdAt: -1 })` in `src/models/Task.ts`; for the unique username index it is
   `unique: true` on the `username` field in `src/models/User.ts`.
2. Mongoose builds declared indexes when the model is initialised. `src/server.ts` awaits `Model.init()` for each
   model before the app listens, so the index exists before the first request. A model missing from that list
   relies on background auto-indexing and can serve traffic first; add its `init()` to the list.
3. Know what a unique index does to data that is already there. Building it fails if two existing documents
   already share the key, and the model's `init()` then rejects and the service does not start. Find the
   duplicates first (in the Atlas shell or `mongosh`):

   ```js
   db.users.aggregate([
     { $group: { _id: '$username', n: { $sum: 1 } } },
     { $match: { n: { $gt: 1 } } },
   ]);
   ```

   Fix or remove the duplicates with a data change (below) before the deploy that adds the index.

## Deploy order

1. Ship code that is correct with and without the change (backward compatible), and only then the index or the
   data change that depends on it.
2. Take or confirm a recent backup first (`docs/runbooks/backup-restore.md`).
3. Deploy the release. The new index is built at boot by `Model.init()`. Watch the log for the start line
   (`API listening`); a failure to start with an index build error means existing data violates the index.
4. Run the inspect step below and record the result.

## Data changes: two backward-compatible steps

Never rename or reshape a field in one release. Use two:

1. **Expand.** Release N writes the new shape and still reads the old one (and the other way round). Run the
   backfill script over existing documents; it must be safe to run twice.
2. **Contract.** Release N+1 stops reading the old shape. Only after N has been live and the backfill is
   verified, remove the old field.

A rollback of N+1 then lands on a release that still understands both shapes. A change that cannot be split like
this needs a maintenance window and its own entry in the decision log.

## Inspect

List the indexes on a collection and compare them with the model:

```js
db.tasks.getIndexes();
```

Check that each declared index is present with the right keys and `unique` flag; for `tasks` expect `ownerId_1_createdAt_-1`, for `users` expect `username_1` with `unique: true`. `db.tasks.stats().indexSizes` shows what each costs.

## Roll back

1. Redeploy the previous release from the provider dashboard (see `docs/runbooks/deploy.md`). Code that does not
   need the index keeps working with it present, so this is safe first.
2. If the index itself must go (it blocks writes, or it was built wrongly), drop it by name:

   ```js
   db.tasks.dropIndex('ownerId_1_createdAt_-1');
   ```

   Use the name `getIndexes()` printed. Dropping a unique index removes the guarantee it gave; the code that
   relied on it must already be rolled back.

3. If a data change ran, run its reverse script. A backfill that only added a field is reversed by removing that
   field from the documents it touched; keep the list of touched documents or a marker field for this.
4. Record what was dropped or reversed and why in the decision log.

## After the first frontend deploy

Smoke-check the security headers: load the site and the browser console must show no Content-Security-Policy
violations (the default policy allows same-origin scripts, and styles from the same origin, over https or inline). Record the result in
`docs/runbooks/deploy.md`.
