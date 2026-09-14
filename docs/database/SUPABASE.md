# Supabase setup and launch checklist

Project confirmed by the owner: `zaooprrcqphzocigtrxg`, Sydney. Keep the existing Pearl Energy application branding.

## Handoff status — 14 September 2026

- Consumer and admin code now use the Supabase provider by default. Demo mode requires explicit `VITE_DATA_MODE=local`; there is no automatic fallback.
- Five versioned SQL migrations and the `pos-api` / `push-dispatch` Edge Functions are prepared locally.
- The source Firebase project inventory showed no Auth users or Firestore collections to transfer. No customer data was deleted. Recheck the source at cutover in case anything was added afterward.
- The last connected MCP SQL check returned `current_user = supabase_read_only_user`, `transaction_read_only = on`, and zero public tables. **No Supabase migration or Edge Function deployment has been performed by this implementation yet.**
- The saved MCP URL has been corrected to `https://mcp.supabase.com/mcp?project_ref=zaooprrcqphzocigtrxg`, but the open tool session still needs reconnecting to pick up its write permissions.
- The project publishable key has not been retrieved. Local live-mode login intentionally reports incomplete setup until this is provided. Do not confuse build success with live service readiness.

These are observed handoff facts, not a permanent deployment record. Update this section after applying and verifying the hosted setup.

## 1. Apply the database

Reconnect the project-scoped Supabase MCP and verify that migration/deployment tools are available. Inspect existing tables and migration history first. If the project is no longer empty, stop and reconcile the schema rather than overwriting it. Use `apply_migration` for DDL, not ad-hoc SQL writes through a read-only session.

Alternatively, an authorized operator can use the pinned local CLI from this repository:

```powershell
npm.cmd ci
npx.cmd supabase login
npx.cmd supabase link --project-ref zaooprrcqphzocigtrxg
npx.cmd supabase migration list
npx.cmd supabase db push --dry-run
npx.cmd supabase db push
```

Review the target before accepting a push. Never run a database reset against the hosted project. If migrations were applied through MCP, reconcile CLI migration-history versions before using `db push`; do not blindly mark mismatched migrations as applied. Follow the [official migration workflow](https://supabase.com/docs/guides/deployment/database-migrations).

Migrations create the schema and configured loyalty programs, **not mock customers, fake balances, production stations or sample sales**. Publish real catalogs/stations through the admin dashboard after provisioning its owner.

## 2. Configure the app and Vercel

Get the project's **publishable** key from Supabase project settings. A legacy `anon` key is also accepted, but never a secret/service-role key. Put these values in the ignored local `.env.local` and in the corresponding Vercel environment (Production and any intended Preview environment):

```dotenv
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://zaooprrcqphzocigtrxg.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<project publishable key>
```

Restart Vite locally and rebuild/redeploy Vercel after changing these build-time variables. A Git push cannot configure Vercel environment variables on its own. Existing `VITE_DATA_MODE=local` in Vercel must be changed explicitly for live mode. Remove obsolete Firebase settings from deployment configuration only after cutover verification; keep an offline rollback record.

Run `npm.cmd run dev`; open `http://localhost:5173/` for the consumer app and `http://localhost:5173/admin.html` for the admin dashboard. The latter is a separate Vite HTML entry, not a separate database.

## 3. Configure hosted authentication

The checked-in `supabase/config.toml` configures local development; it does not automatically change the hosted project's Auth settings.

In hosted Authentication settings, enable email/password sign-in, require email confirmation, use a minimum password length of at least 10, and configure a real SMTP sender. Set the Site URL to the exact deployed application origin. Allow its `/` and password-recovery `/?reset=1` return URLs; allow localhost/127.0.0.1:5173 equivalents only for development. Avoid broad production redirect wildcards. See [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

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

The owner planned to choose/connect the POS after completing the app. Until then, leave integrations unprovisioned/inactive. Purchases, points and spins will not appear magically, and live mode has no simulated purchase button.

For each actual vendor store, create an integration row in `private.pos_integrations` referencing a real station. Provision a random server-held signing secret and key ID, bound to that integration UUID/provider. Activate only after testing. The server-only `supabase/.env.example` shows the shape; do not commit the filled file.

```powershell
npx.cmd supabase secrets set --env-file supabase/.env --project-ref zaooprrcqphzocigtrxg
npx.cmd supabase functions deploy pos-api --project-ref zaooprrcqphzocigtrxg --use-api
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the hosted Edge runtime, not browser build variables. Do not paste them into client configuration. The function requires its HMAC even though Supabase gateway JWT verification is disabled for this custom-auth endpoint. The full body/signature, retries, refund semantics and offline-event limitations are in [POS-CONTRACT.md](POS-CONTRACT.md).

## 6. Optional notifications and wallet services

Admin-published notifications appear in the app without Web Push. To enable browser push, generate a VAPID pair, set its public half as `VITE_WEB_PUSH_PUBLIC_KEY`, and configure `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` and a separate random `PUSH_WORKER_SECRET` in Edge secrets. Deploy `push-dispatch` and schedule an authenticated POST to its function URL using `Authorization: Bearer <PUSH_WORKER_SECRET>`. Protect scheduler secrets in a server secret store. A worker invocation claims up to 10 deliveries; monitor throughput and failures. Scheduling and real-device delivery are not configured or verified yet.

Wallet passes still require an actual authenticated issuer and Apple/Google certificates/accounts. `VITE_WALLET_API_URL` is only an integration hook, not a deployed issuer. The issuer must verify the Supabase JWT and derive membership server-side; never trust points passed by a browser. Add its exact origin to the Vercel CSP if an external issuer is used. Live Google Maps and vendor fuel-price feeds likewise need their actual provider configuration. Manual admin-published station prices are supported.

## 7. Verification and recovery gate

```powershell
npm.cmd test
npm.cmd run test:edge
npm.cmd run build
npm.cmd audit
```

The SQL suite runs every migration in an in-process PostgreSQL engine with an Auth role shim. It checks RLS/grants, owner isolation, immutable ledger, idempotency, refund caps, manager scope/revocation, cutoff rules, stock/coupon atomicity, campaign reversal and push-queue leases. Contract tests cover HMAC/size/payment validation; night-deal tests cover Sydney DST and visibility.

This environment had no usable browser automation or Docker-backed hosted-equivalent stack, so visual browser QA, live Auth/SMTP/OAuth/Realtime, Edge deployment and multi-connection contention/load tests remain outstanding. Do not describe those as passed.

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
