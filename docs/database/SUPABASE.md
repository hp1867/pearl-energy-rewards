# Supabase setup and launch checklist

Project confirmed by the owner: `zaooprrcqphzocigtrxg`, Sydney. Keep the existing Pearl Energy application branding.

## Handoff status — 15 September 2026 (Australia/Sydney)

- Consumer and admin code now use the Supabase provider by default. Demo mode requires explicit `VITE_DATA_MODE=local`; there is no automatic fallback.
- All five application migrations were applied to the hosted project on 14 September UTC. There are 17 public and 12 private tables. Both `pos-api` and `push-dispatch` are deployed and active (version 1).
- The source Firebase project inventory showed no Auth users or Firestore collections to transfer. No customer data was deleted. Recheck the source at cutover in case anything was added afterward.
- MCP write access was verified as `current_user = postgres`, `transaction_read_only = off`. The project URL is `https://zaooprrcqphzocigtrxg.supabase.co`.
- The repository migration versions now exactly match the seven hosted records: two pre-existing connectivity-test migrations, followed by the five application migrations. Existing history was preserved; no hosted reset or destructive reinitialization was performed.
- The enabled publishable key was retrieved into ignored `.env.local`; no service-role key was placed in browser code. Generated database types are checked in at `src/supabase/database.types.ts`.
- The owner confirmed the production site as `https://pearl-energy-rewards.vercel.app/`. Its current public bundle was inspected and has no Supabase URL/key. Vercel CLI has no usable authenticated session here; production build variables still need to be set there.
- Hosted Auth previously used `http://localhost:3000`, had no additional return URLs and required only six password characters. The reviewed minimal configuration at `deployment/supabase/config.toml` corrected those three settings. Email confirmation, existing TOTP settings and all unrelated hosted settings were preserved. A subsequent diff showed zero pending declared changes.
- Public Auth settings report email sign-in/signup enabled, confirmation required, and Google/Apple disabled. No real customer signup, email delivery or OAuth callback has been verified. Custom production SMTP still needs configuration/verification with the chosen sender.
- The security advisor reports no findings. All 17 public tables have RLS. The performance advisor only reported informational unused indexes on the newly empty database; retain them until real usage is measured. See the [unused-index advisory](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- A hosted smoke test passed for profile idempotency, owner isolation, denied direct balance/staff access, POS-sale retry idempotency, earned points and ledger reconciliation. It used synthetic identities inside one rolled-back SQL transaction, not the Auth service. A separate query verified zero remaining Auth users, customers, receipts, ledger entries or smoke-test stations/integrations.
- Anonymous customer-table and profile-RPC HTTP requests returned 401 as intended. An unsigned POS request returned 401. The deployed push worker returned 503 (`Worker not configured`), as expected until its server secrets are provisioned.

Applied application migrations:

| Version | Migration |
| --- | --- |
| `20260914124339` | `pearl_loyalty_core` |
| `20260914124410` | `pearl_catalog_and_pos` |
| `20260914124425` | `pearl_push_devices` |
| `20260914124440` | `pearl_campaigns` |
| `20260914124451` | `pearl_pos_lookup` |

No real customers, fake balances, stations or sales were seeded. The owner still needs to confirm the main-admin email and create/confirm that account before staff access is assigned. POS credentials are intentionally unprovisioned until the actual vendor is selected, as requested.

## 1. Maintain the deployed database

The initial database is already applied. Inspect tables and migration history before any further changes. Do not replay the initial SQL, edit applied migration contents or reset the hosted database. Create and test a new versioned migration for each future schema change. Use `apply_migration` for hosted DDL, not untracked ad-hoc schema edits.

An authorized operator can inspect and apply future changes with the pinned CLI:

```powershell
npm.cmd ci
npx.cmd supabase login
npx.cmd supabase link --project-ref zaooprrcqphzocigtrxg
npx.cmd supabase migration list
npx.cmd supabase db push --dry-run
```

Only run `npx.cmd supabase db push` after reviewing the dry run and verifying the target. The current local/MCP versions are already aligned; reconcile any future mismatch rather than blindly marking migrations as applied. Follow the [official migration workflow](https://supabase.com/docs/guides/deployment/database-migrations).

Migrations create the schema and configured loyalty programs, **not mock customers, fake balances, production stations or sample sales**. Publish real catalogs/stations through the admin dashboard after provisioning its owner.

## 2. Configure the app and Vercel

Get the project's **publishable** key from Supabase project settings. A legacy `anon` key is also accepted, but never a secret/service-role key. Put these values in the ignored local `.env.local` and in the corresponding Vercel environment (Production and any intended Preview environment):

```dotenv
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://zaooprrcqphzocigtrxg.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<project publishable key>
```

Local `.env.local` is already configured. For the confirmed Vercel project, open **Settings → Environment Variables**, set the three variables above for Production, and redeploy. The publishable key can be copied from the local file or Supabase API Keys settings; never paste a server secret. A separate Vercel login/connection is needed for an agent to change these settings directly. GitHub access does not grant Vercel account access.

Restart Vite locally and rebuild/redeploy Vercel after changing these build-time variables. A Git push cannot configure Vercel environment variables on its own. Existing `VITE_DATA_MODE=local` in Vercel must be changed explicitly for live mode. Remove obsolete Firebase settings from deployment configuration only after cutover verification; keep an offline rollback record.

Run `npm.cmd run dev`; open `http://localhost:5173/` for the consumer app and `http://localhost:5173/admin.html` for the admin dashboard. The latter is a separate Vite HTML entry, not a separate database.

## 3. Configure hosted authentication

The root `supabase/config.toml` configures local development. **Do not push that full development template to production**: it declares defaults that differ from the hosted project's existing security/service settings. The separate `deployment/supabase/config.toml` declares only the reviewed production Site URL, return URLs and minimum password length. They have been applied and verified using:

```powershell
npx.cmd supabase config diff --workdir deployment --project-ref zaooprrcqphzocigtrxg
# Only after reviewing the exact declared changes:
npx.cmd supabase config push --workdir deployment --project-ref zaooprrcqphzocigtrxg
```

The CLI may show `remote_only` differences for intentionally undeclared settings. Those are preserved, not reset. Do not add unrelated local defaults just to make the entire diff empty.

Email/password sign-in and confirmation are enabled. The Site URL, exact `/` and password-recovery `/?reset=1` returns, local development equivalents and minimum password length are configured. Configure and verify a real SMTP sender before public signup. Supabase's default email service is restricted to authorized project-team recipients and is not production email infrastructure; see [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp). Avoid broad production redirect wildcards; see [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

For Google sign-in, enable the Google provider with your web OAuth client ID and secret. In Google Cloud, authorize your app origin and this Supabase callback: `https://zaooprrcqphzocigtrxg.supabase.co/auth/v1/callback`. The OAuth client secret belongs in Supabase provider settings, not in Vite. Complete consent-screen audience/testing configuration. Follow [Google provider setup](https://supabase.com/docs/guides/auth/social-login/auth-google). Apple requires its own provider credentials; its button is not evidence that the provider is enabled.

Test signup → confirmation → profile creation, email/password login, Google callback, password recovery and sign-out on both localhost and the actual Vercel origin. PKCE email flows should be opened in the same browser that initiated them. Fake OTP, mobile-password login and biometric placeholders are no longer used as authentication.

No Firebase billing plan is required by the active application path. Supabase/Auth/email/hosting services still have their own quotas, costs and availability limits; this migration does not disable provider billing or promise a free production service.

## 4. Bootstrap the owner, then delegate managers

The intended owner must sign up and confirm their email first. No first-user-is-admin shortcut or shipped admin password exists in live mode. An authorized database operator then substitutes the **owner-confirmed exact email** in this one-time SQL and verifies the result:

```sql
do $$
declare owner_id uuid;
begin
  select id into owner_id from auth.users
    where lower(email)=lower('REPLACE_WITH_CONFIRMED_OWNER_EMAIL')
      and email_confirmed_at is not null;
  if owner_id is null then raise exception 'Confirmed owner account not found'; end if;
  insert into private.staff_access(user_id,role,display_name,active)
    values(owner_id,'admin','Pearl Energy owner',true)
    on conflict(user_id) do update set role='admin',active=true,updated_at=now();
  insert into private.audit_logs(action,target_id,detail)
    values('staff.bootstrap',owner_id::text,'{"source":"authorized setup"}');
end $$;
```

Sign into `/admin.html` with that account. Add real stations first, then categories/products/offers/rewards and fuel prices. Staff sign up and confirm email as ordinary users; the owner assigns station-limited Tonight Only access from Staff Access. Restrict production administrator accounts and configure MFA/operational access controls before launch; RPC-level mandatory AAL2 enforcement is not part of this baseline.

## 5. Connect the POS when the app is ready

The owner planned to choose/connect the POS after completing the app. The `pos-api` function is deployed, but integrations/signing secrets remain unprovisioned. Until the real vendor is selected, leave integrations unprovisioned/inactive. Purchases, points and spins will not appear magically, and live mode has no simulated purchase button.

For each actual vendor store, create an integration row in `private.pos_integrations` referencing a real station. Provision a random server-held signing secret and key ID, bound to that integration UUID/provider. Activate only after testing. The server-only `supabase/.env.example` shows the shape; do not commit the filled file.

```powershell
npx.cmd supabase secrets set --env-file supabase/.env --project-ref zaooprrcqphzocigtrxg
npx.cmd supabase functions deploy pos-api --project-ref zaooprrcqphzocigtrxg --use-api
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the hosted Edge runtime, not browser build variables. Do not paste them into client configuration. The function requires its HMAC even though Supabase gateway JWT verification is disabled for this custom-auth endpoint. The full body/signature, retries, refund semantics and offline-event limitations are in [POS-CONTRACT.md](POS-CONTRACT.md).

## 6. Optional notifications and wallet services

Admin-published notifications appear in the app without Web Push. The `push-dispatch` function is deployed but fails closed until configured. To enable browser push, generate a VAPID pair, set its public half as `VITE_WEB_PUSH_PUBLIC_KEY`, and configure `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` and a separate random `PUSH_WORKER_SECRET` in Edge secrets. Schedule an authenticated POST to its function URL using `Authorization: Bearer <PUSH_WORKER_SECRET>`. Protect scheduler secrets in a server secret store. A worker invocation claims up to 10 deliveries; monitor throughput and failures. Secrets, scheduling and real-device delivery are not configured or verified yet.

Wallet passes still require an actual authenticated issuer and Apple/Google certificates/accounts. `VITE_WALLET_API_URL` is only an integration hook, not a deployed issuer. The issuer must verify the Supabase JWT and derive membership server-side; never trust points passed by a browser. Add its exact origin to the Vercel CSP if an external issuer is used. Live Google Maps and vendor fuel-price feeds likewise need their actual provider configuration. Manual admin-published station prices are supported.

## 7. Verification and recovery gate

```powershell
npm.cmd test
npm.cmd run test:edge
npm.cmd run build
npm.cmd audit
```

The SQL suite runs every migration in an in-process PostgreSQL engine with an Auth role shim. It checks RLS/grants, owner isolation, immutable ledger, idempotency, refund caps, manager scope/revocation, cutoff rules, stock/coupon atomicity, campaign reversal and push-queue leases. Contract tests cover HMAC/size/payment validation; night-deal tests cover Sydney DST and visibility.

The suite now includes 37 tests (24 database, 7 POS contract, 6 night-deal), including the rollback behavior of `tests/hosted-smoke.sql`. The same smoke script passed on hosted PostgreSQL. Edge type checks and both frontend build entries passed. `npm audit` reported zero vulnerabilities in the repository's locked dependencies. The Supabase advisor and expected HTTP-denial checks above were performed after deployment.

This environment had no usable browser automation or Docker-backed hosted-equivalent stack. Visual browser QA, actual Auth/SMTP/OAuth/Realtime flows, valid signed Edge/POS-vendor requests, Web Push delivery and multi-connection contention/load tests remain outstanding. Do not describe those as passed. The SQL role test is not a real user-login test. Operator smoke-test fixtures roll back; harmless identity-sequence gaps can remain, and membership numbers must never be treated as a customer count.

Before launch, also verify Supabase security/performance advisories, rate limits, email abuse prevention/CAPTCHA where configured, allowed redirects, RLS under real JWTs, administrative MFA, POS exception reconciliation, consumer terms for reward expiry/negative balances/promotions, and a separate draw administration process (monthly draw entries are stored, but no automated winner selection is implemented).

Configure database backups suitable for the business and test a restore to a separate project. Include `private` data and Auth mappings in the recovery plan; document provider credentials separately. Never put dumps in Git. Reconcile every account after restore:

```sql
select a.customer_id,a.balance,coalesce(sum(l.delta),0) as ledger_balance
from public.loyalty_accounts a
left join public.loyalty_ledger l on l.customer_id=a.customer_id
group by a.customer_id,a.balance
having a.balance<>coalesce(sum(l.delta),0);
```

Expected result: no rows. Define retention and privacy-deletion procedures before production. The financial outbox has no general dispatcher yet; do not rely on it for exports or external notifications without implementing and monitoring a consumer.
