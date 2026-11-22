# ANVIK AI V2 — Hardening Handoff

This handoff records infrastructure actions completed while GitHub branch
creation was blocked by the connected GitHub integration returning HTTP 403.

## Completed live changes

1. Seven Vercel variables flagged `readable-secret` were changed to Sensitive
   and scoped to Production:
   - `POSTGRES_URL_NON_POOLING`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `POSTGRES_PRISMA_URL`
   - `SUPABASE_SECRET_KEY`
   - `SUPABASE_JWT_SECRET`
   - `POSTGRES_PASSWORD`
   - `POSTGRES_URL`
2. The variables were re-read with decryption disabled. All seven now report
   `type=sensitive`, Production-only target, and no `securityIssues`.
3. The Vercel project Serverless Function region was changed to `bom1`.
4. The current source commit was redeployed. New deployment:
   `dpl_uaAUr5Usu994xhmBxCtWfzmyVFLF`
   - State: READY
   - Target: production
   - Region: bom1
   - Commit: 74c0585a73ce67dcec480e29c58c9118e74146db
   - Production alias: anvik-ai-v2.vercel.app
5. A daily `pg_cron` job was installed to delete rate-limit buckets older than
   seven days. It is active at 00:23 UTC daily.
6. Supabase advisors were rerun:
   - Security: 0 high/critical findings; 1 warning for leaked-password
     protection disabled; 4 informational RLS-no-policy notices for
     server-only tables with no client grants.
   - Performance: 3 informational unused-index notices.
   - Health: no findings.

## Not completed

GitHub branch creation returned HTTP 403, so no branch, source commit, or PR
was created. No direct push to `main` was attempted.

The following application changes remain unimplemented:
- Replace the in-memory rate limiter and wire it to `consume_rate_limit` on
  all relevant routes.
- Add route-specific Zod validation and authentication/authorization rules.
- Safe structured server logging and sanitized error responses.
- Supabase/Gemini dependency health checks in `/api/health`.
- Sentry or equivalent monitoring and alert routing.
- CSP nonce strategy, removal of unsafe script directives where compatible,
  and CORS review.
- Confirm no client bundle imports privileged Supabase adapters or calls
  privileged credit RPCs.
- Fix React hook warnings and optimize appropriate images.
- Resolve npm `cache-dir` warning and explicitly approve only reviewed
  dependency install scripts.
- Add CI tests for RLS, credit concurrency/idempotency, rate limiting,
  API validation, and health checks.
- Complete SECURITY.md, README, `.env.example`, and migration/rollback docs
  in the actual repository (this archive contains draft security/migration
  documentation only).

## GitHub permissions needed

For `areebausaf742-design/anvik-ai-v2`, grant the GitHub connection:
- Contents: Read and write
- Pull requests: Read and write
- Metadata: Read-only

Then create branch `anvik-v2-a-to-z-hardening` from current `main`, apply the
source changes, run CI, and open a PR to `main`. Do not push directly to main.

## Manual Supabase Auth action

Open Supabase Dashboard > Authentication > Settings > Password Security:
- Enable leaked-password protection.
- Set minimum password length (recommended 12 or more).
- Review password strength requirements.
Then review Authentication > URL Configuration:
- Keep `https://anvik-ai-v2.vercel.app` as Site URL.
- Keep only required production and preview callback URLs.
- Do not remove a redirect URL until Google OAuth and email confirmation
  callbacks have been tested.
