# ANVIK AI V2 Migration Log

## Production database changes

| Version | Migration | Summary |
|---|---|---|
| 20261122150640 | entitlements | Entitlement schema |
| 20261122150701 | multi_user_credits | Per-user credit schema |
| 20261122150713 | consent_records_hardening | Consent record controls |
| 20261122150955 | anvik_v2_initial | Initial ANVIK V2 schema |
| 20261122154414 | backend_v2_hardening | Owner-only chat/message reads, server-only tables/RPCs, credit reservation engine, distributed rate-limit RPC |
| 20261122154708 | backend_v2_hardening_trigger_acl | Restrict ledger trigger function execution |
| 20261122154805 | backend_v2_restore_owner_read_grants | Restore authenticated owner-read grants protected by RLS |
| 20261122160403 | anvik_rate_limit_bucket_cleanup | Daily cleanup of rate-limit buckets older than seven days |

## Rollback: rate-limit cleanup schedule

The cleanup job is non-destructive to active buckets. To disable only the
scheduled cleanup:

```sql
select cron.unschedule(jobid)
from cron.job
where jobname = 'anvik-rate-limit-bucket-cleanup';
```

Do not drop `pg_cron`; it may be shared by other project jobs. This rollback
does not undo the earlier RLS/credit hardening migrations.

## Rollback: backend hardening

Do not automatically reverse the chat RLS, credit RPC, or append-only ledger
migrations. They protect existing user data and balances. A rollback requires
a reviewed forward-fix or an explicitly tested migration that preserves
ownership, balance invariants, and existing rows. Never disable RLS or restore
anonymous chat access as a rollback shortcut.
