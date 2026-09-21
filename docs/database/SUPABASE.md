# Supabase setup and handover

Owner-confirmed project: `zaooprrcqphzocigtrxg`, Sydney. Consumer site: https://pearl-energy-rewards.vercel.app/ . Admin: the same site's /admin.html.

## Current implementation

The active app/admin provider is Supabase, not Firebase. Explicit `VITE_DATA_MODE=local` remains a separate preview; failures never automatically switch to fake data.

The reliability, scheduler and identity/consent migrations were applied on 16 September 2026 (Sydney). They add durable POS intake, automatic ordinary-points protection for offer exceptions, historical earning/campaign/product rules, reconciliation, strict verified-phone membership, consent history and restricted admin recovery. A follow-up migration adds three advisor-recommended foreign-key indexes.

The hosted project has 23 public and 22 private application tables. No real customers, sample sales, fake balances or invented legal policies were seeded. Hosted verification uses synthetic fixtures inside a transaction that rolls back. Identity sequence gaps are harmless and membership numbers are not customer counts.

Functions: pos-api v2, member-support v1; existing push-dispatch v1 is unchanged. Both Cron jobs were active with successful recent runs when checked on 21 September. The hosted role/RLS/POS smoke test passed, including rollback. See [architecture](ARCHITECTURE.md), [POS contract](POS-CONTRACT.md), and [recovery](RECOVERY.md).

## Still needs owner setup

- SMS provider: intentionally deferred. Email-confirmed members activate automatically; no SMS or extra activation step. Phone ownership is not claimed without real verification.
- Confirmed owner email/account: no administrator has been guessed or auto-created.
- Approved membership terms, privacy notice and account-closure disclosure: publish them through Policies & Consent once owner access is assigned. Missing documents no longer block membership, but unpublished documents cannot have acceptance recorded. Publish approved documents before public launch.
- Production SMTP sender and real signup/recovery delivery verification. Google is enabled in the hosted provider settings, but a real OAuth round trip has not been verified here.
- Real POS vendor/adapter, branch catalogs, SKU mappings, reward rules and integration signing keys.
- Hosted backup coverage/retention, alert routing, real restore drill and launch/load/security acceptance tests.

No paid SMS, SMTP, backup plan or other third-party service was purchased/configured on the owner's behalf.

## Browser configuration

The confirmed project's URL and public publishable key are checked into src/supabase/settings.js as safe browser defaults. A fresh Vercel build can connect without relying on this computer's ignored .env.local. These are not administrative credentials.

Optional complete environment overrides:

```dotenv
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://zaooprrcqphzocigtrxg.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<project publishable key>
```

A partial URL/key override fails closed rather than mixing projects. Never use service-role/secret keys in browser variables. Explicit Vercel demo-mode or stale environment overrides still require correction in Vercel. Build-time environment changes require a rebuild. GitHub access does not grant Vercel settings access.

Use npm.cmd run dev, then localhost:5173/ and /admin.html. /recovery.html is a third build entry for support-initiated recovery.

## Authentication configuration

Do not push the full root development supabase/config.toml to production. deployment/supabase/config.toml declares only reviewed hosted Site URL, exact return URLs and minimum password length. It adds the production /recovery.html URL while preserving existing Google, email-confirmation, TOTP and SMS settings.

```powershell
node_modules\.bin\supabase.cmd config diff --workdir deployment --project-ref zaooprrcqphzocigtrxg
# Review declared changes before pushing:
node_modules\.bin\supabase.cmd config push --workdir deployment --project-ref zaooprrcqphzocigtrxg
```

Undeclared remote_only differences are preserved. Do not add unrelated development defaults just to silence them.

Email confirmation remains required. Verify SMTP with the chosen sender and recipient; Supabase's default email service is not general production delivery ([SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp)). For Google, retain the configured provider and verify the consent screen and callback https://zaooprrcqphzocigtrxg.supabase.co/auth/v1/callback ([official setup](https://supabase.com/docs/guides/auth/social-login/auth-google)). Disabled providers are hidden.

Phone change/activation uses Supabase updateUser(phone) then verifyOtp(phone_change), requiring a functioning [SMS provider](https://supabase.com/docs/guides/auth/phone-login). Admins cannot fake verification. No provider secrets belong in Git.

Test signup/confirmation, login, Google callback, phone uniqueness/OTP, consent activation, logout and password recovery on the real origin. Self-requested PKCE links should open in the originating browser. Admin-requested recovery uses the separate in-memory recovery page and sends only to the registered verified email; delivery is not guaranteed just because the email service accepted a request.

No Firebase billing dependency remains in the active path. Supabase and other services still have their own quotas/costs.

## Bootstrap the owner

The owner signs up and confirms email, then an authorised operator substitutes the owner-confirmed exact email below. No first-user-admin or shipped administrator password exists.

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
    values('staff.bootstrap',owner_id::text,'{"source":"authorised setup"}');
end $$;
```

Owner staff access is separate from consumer loyalty activation. Sign into /admin.html, publish approved policies, real branches/catalogs and rules, and delegate assigned-station Tonight Only access. Restrict administrator accounts and enable MFA; mandatory RPC-level AAL2 enforcement remains a separate launch control. Recovery controls are main-admin only; there is no account merging or arbitrary email-reset destination.

## Maintain migrations and POS setup

Never rewrite an applied migration, reset production or seed demo records into it. Inspect the target and migration history, create/test a new migration, review dry run, then apply.

```powershell
node_modules\.bin\supabase.cmd db push --dry-run --project-ref zaooprrcqphzocigtrxg --skip-vault
# Only after review:
node_modules\.bin\supabase.cmd db push --project-ref zaooprrcqphzocigtrxg --skip-vault
```

Keep generated public types at src/supabase/database.types.ts aligned with deployed schema.

POS integration is intentionally deferred until the app is ready and the vendor is chosen. Create a real per-store integration, publish SKU mappings and typed reward rules, provision server-held HMAC keys and test before activation. There are no simulated live purchases. See supabase/.env.example for server secret shapes, never commit the filled file. Deploy only intended functions; do not prune others.

## Verification and limits

```powershell
npm.cmd test
npm.cmd run test:reliability
npm.cmd run test:edge
npm.cmd run build
npm.cmd audit
```

Standard tests: 52 (29 PostgreSQL/PGlite, 12 POS contract/intake, 5 identity/auth settings, 6 timed offers). Native PostgreSQL tests: 16, including simultaneous operations, durable intake, transient benefit retry and an isolated physical restore. All three Edge functions type-check, and consumer/admin/recovery entries build. CI runs the same tests on Windows.

Local tests use an Auth-role shim, not real hosted signup/SMTP. Hosted SQL smoke checks are rollback-only. Native concurrency testing is not a production capacity benchmark, and local restore testing is not configured hosted backup protection. Browser visual QA, real OAuth/SMTP/SMS, valid signed vendor Edge traffic and production restore remain separate launch checks.

The security advisor's INFO notices for private tables with RLS but no browser policies are intentional deny-by-default protection. Unused-index INFO notices are expected on an empty pre-launch database; retain indexes until measured usage justifies removal.

The financial outbox has no general export dispatcher. Web Push remains unconfigured without VAPID/worker secrets and scheduling; admin announcements still work as in-app records. Wallet passes, live maps/fuel feeds and prize-draw administration require their real issuers/providers/processes. They are not silently completed by database migrations.
