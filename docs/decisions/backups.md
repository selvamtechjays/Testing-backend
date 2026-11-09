# Decision: backups

Status: accepted for v1 (DEC-071, interim frequency and retention per ASM-022).

| Item               | Value                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| Mechanism          | MongoDB Atlas Cloud Backup (native scheduled snapshots)                |
| Frequency          | daily                                                                  |
| Retention          | 7 days                                                                 |
| Scope              | the whole cluster, so the `users` and `tasks` collections are included |
| Excluded           | `sessions` (ephemeral; every user signs in again after a restore)      |
| Failure visibility | Atlas alert "Backup snapshot failed" emailed to the team address       |
| Access             | Atlas project members only, the same people who can reach live data    |
| Tier cost          | none if the current tier supports Cloud Backup; otherwise see hosting  |

Any Atlas tier cost needed to enable Cloud Backup is added to the cost line in
`docs/decisions/hosting.md`.

No uptime, recovery-time or recovery-point target in v1.

Frequency and retention stay interim until the client states otherwise (OQ-PLAT-02). Operating steps are in
`docs/runbooks/backup-restore.md`.
