# Runbook: backup and restore

Policy is in `docs/decisions/backups.md`. Access to snapshots, scratch clusters and downloads is limited to
the Atlas project members who can already reach live data; backups hold credential hashes and personal
tasks and are treated to the same standard as live data.

## Snapshot settings

Human/infra, once, on the existing Atlas cluster:

1. Open the cluster, then Backup, and enable Cloud Backup.
2. Policy: one daily snapshot, retained for 7 days.
3. Record the cluster tier here: `TBC by TL`. If the current tier cannot enable Cloud Backup, record the
   minimum paid tier and its monthly cost, and add it to `docs/decisions/hosting.md`.

Snapshots cover the whole cluster, so `users` and `tasks` are included. `sessions` is not relied on after a
restore; everyone signs in again.

## Failure alerts

Human/infra, once, in the Atlas project:

1. Add the alert condition "Backup snapshot failed".
2. Notify the team email address: `TBC by TL`.

Alert name: Backup snapshot failed. If no new snapshot appears in the Backup tab for 24 hours, the team
checks the Backup tab and the alert history; a failed backup is never left unflagged.

## Restore check

Run after the first snapshot exists and after any change to the backup policy.

1. Restore the latest snapshot into a scratch cluster, or download it. Keep the scratch cluster and the
   download restricted to the same Atlas project members as production.
2. Count the documents in `users` and `tasks`; both must be non-zero once real accounts and tasks exist.
3. Add a row to the result table below, then delete the scratch cluster or download.

| Date | Snapshot id | `users` count | `tasks` count | Checked by |
| ---- | ----------- | ------------- | ------------- | ---------- |
|      |             |               |               |            |
