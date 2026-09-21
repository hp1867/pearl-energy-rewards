# Reliability and recovery runbook

## Observe the worker and the data

Cron retries due POS receipts every minute (20 per batch, bounded backoff/attempts) and stores database health every 15 minutes. Check scheduler recency as well as health: yesterday's healthy report does not prove today's worker is alive.

```sql
select jobname,schedule,active from cron.job where jobname like 'pearl-%';
select j.jobname,d.status,d.start_time,d.end_time,d.return_message
from cron.job j join cron.job_run_details d on d.jobid=j.jobid
where j.jobname like 'pearl-%' order by d.start_time desc limit 20;
select checked_at,report from private.database_health_checks order by checked_at desc limit 5;
select private.database_health();
```

Expected balance/receipt/stock mismatch counts are zero. Investigate backlog age, exhausted retries, invalid financial/identity input and missing manifests. Correct causes, then use audited retries. Never edit immutable intake/receipts/ledger or overwrite balances. Ordinary offer exceptions are auto-resolved and require no approval; distinct financial errors and consumed-prize refund reviews are not automatically waived.

A complete daily POS manifest is needed to find receipts the vendor never delivered. An internally balanced ledger is not proof of complete POS ingestion. Alert delivery, log retention and incident escalation need an assigned operator/contact; the admin screen alone is not external alerting.

## Local evidence, not a hosted-backup claim

The native reliability suite creates an isolated PostgreSQL database, applies migrations, tests separate concurrent connections, cleanly stops it, copies its physical data directory and starts an independent restored instance. It checks balances, permissions, historical rules and queued receipts. Test instances are removed afterward. Windows initdb needs a normal process token. Do not copy a physical data directory across PostgreSQL major versions.

This validates the local test procedure, not Supabase's actual backup coverage, SMTP/SMS, service configuration or a whole-service recovery objective. The Auth shim is not the hosted Auth HTTP service.

## Before public launch

1. Owner chooses acceptable data loss (RPO), recovery time (RTO), retention, restore destination and incident contact. Confirm hosted backup coverage and actual successful timestamps. Do not enable paid/PITR services without approval. See [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).
2. Make encrypted, access-controlled backups outside Git. Include public/private data, grants/roles, extensions, migration history, Auth identities and stable domain-ID mappings. Separately protect Auth/SMTP/SMS configuration, Edge/POS/push secrets, storage objects and recovery keys. Schema SQL alone is not a backup.
3. Restore to a separate authorised test project, never over production as a test. Keep POS/push workers inactive until identity/deduplication state is verified, preventing duplicate delivery/replay.
4. Verify row counts, original IDs, money totals, receipt uniqueness, ledger/account agreement, coupon/stock/rule history, RLS under real customer/manager/admin JWTs, consent/closure/recovery records and queued work. Reconcile against vendor manifests.
5. Record measured RPO/RTO, backup ID, duration, mismatches and corrective action. Approve cutover only after a successful whole-service drill.

Hosted backup retention/PITR, offsite recovery, external alerts, broader load testing and an actual hosted restore drill remain owner/operator launch work. The transaction outbox also needs a general dispatcher before it can be relied on for automated external exports.
