# Email-first registration — 21 September 2026

Owner-requested replacement for the earlier phone-and-activation gate.

## Behaviour

- Email/password registration still needs the Auth confirmation email. Google uses its verified identity through Supabase Auth. The application never marks email or phone verified itself.
- After verification, the member goes directly to Home: no mobile input, SMS challenge, second checkbox, or Activate membership screen.
- The same automatic path handles already-registered email users who were blocked by the old onboarding flow.
- Registration notices explain automatic membership. Published terms/privacy appear next to sign-in buttons; clicking a button acknowledges the displayed versions. Signup metadata carries document choices, not identity/staff authority. OAuth/password-login choices are short-lived and consumed once.
- Missing policies do not block the owner-requested email-first flow. No acceptance is invented, backdated, or bundled with marketing. Publishing proper documents remains a public-launch prerequisite.
- Admin policy explanations and member account settings now match this behaviour. SMS APIs remain for a future explicitly configured release; the app does not offer them now.
- Existing purchases, points, customers, verified-phone uniqueness, closures, RLS and admin permissions are preserved. No account is merged and no points are transferred.

## Deployment and verification

Migration: `20260921024806_email_first_membership.sql`. Deploy before the new frontend; the old client can also read its backward-compatible flags and reach Home.

Regression tests cover repeated activation, verified/unverified email, forged metadata, absent policies, consent idempotency, suspended/closed accounts, protected phone changes, owner-only data, and existing POS/reward behaviour. Hosted verification uses a transaction rolled back in full, without changing a customer's password or email verification status.

The owner reported successful email signup. A full Google OAuth/browser round trip still requires a user-controlled browser test; a successful OAuth redirect response alone is not that test.

The security advisor also reports leaked-password protection disabled (existing Auth setting, not caused by this migration). Review availability/configuration before launch: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . No paid plan or provider change is included here.
