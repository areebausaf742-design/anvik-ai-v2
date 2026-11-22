# ANVIK AI V2 Security Notes

## Current production controls

- Chat and message reads are restricted to authenticated owners by RLS.
- Anonymous access to chats and messages is revoked.
- Authenticated clients have read-only access to chat and message tables.
- Privileged credit RPCs (`reserve_credit`, `refund_credit`, `record_usage`) and
  distributed rate-limit RPC (`consume_rate_limit`) are executable by
  `service_role` only.
- Credit reservations are idempotent and serialized with row locks.
- Credit ledger updates/deletes are blocked by an append-only trigger.
- Server-only tables (`credit_reservations`, `entitlements`, `quota_usage`,
  `rate_limit_buckets`) have RLS enabled and no client grants.
- Vercel's seven identified readable-secret variables are now Sensitive and
  Production-only. Values were not retrieved or printed.
- Production Serverless Functions are configured for `bom1`.

## Important remaining work

The current application source has **not** yet received the planned source-code
hardening. In particular, `lib/rate-limit.ts` still uses in-process Maps and
must be integrated with `consume_rate_limit`; the health route is still a
liveness-only endpoint; route schemas, safe structured logging, Sentry, CSP
nonce strategy, and automated security tests remain to be implemented.

Do not treat this file as evidence that those source-level changes are done.

## Secrets

- Never commit `.env.local`, service-role keys, database passwords, JWT secrets,
  Gemini keys, or the admin token.
- Keep privileged keys server-only. Never use a `NEXT_PUBLIC_` prefix for them.
- Production secrets should be Vercel Sensitive/Secret variables.
- Use separate Supabase projects for Preview and Production before restoring
  privileged Preview credentials. Do not point Preview builds at production
  user data just to make Preview sign-in work.
- Rotate Supabase service-role and database credentials only as a coordinated
  operation across Supabase and Vercel. Do not rotate the JWT signing secret
  casually; doing so invalidates sessions and can disrupt authentication.

## Auth hardening still required

Supabase Auth leaked-password protection remains disabled. Enable it in the
Supabase Dashboard under Authentication > Settings > Password Security.
Choose a strong minimum password length and enable Have I Been Pwned leaked
password protection. Review email confirmation, session lifetime, and redirect
URLs before changing them.
