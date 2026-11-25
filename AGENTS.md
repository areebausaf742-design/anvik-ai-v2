# ANVIK AI — Project Memory (AGENTS.md)

## Stack
- Next.js 15 App Router, TypeScript, React 19.
- Supabase Auth/Postgres (service-role server writes; RLS strict).
- AI: Gemini via `lib/gemini.ts` (model fallback chain) + `lib/ai-gateway.ts` metering.
- State: `store/use-chat-store.ts` (Zustand).
- Styling: `--theme-*` CSS tokens in `app/globals.css`.
- Guest quota: 10 free answers/day per IP (lib/guest-quota.ts).
- Branding: ANVIK (never "Anvik"? use ANVIK).

## Verification (Windows local)
- Run `npx tsc --noEmit --incremental false` and `npm test`.
- Skip local next build and Chromium tests.

## Key files
- lib/ai-gateway.ts — metered AI entrance + failover.
- store/use-chat-store.ts — chat state.
- app/globals.css — theme tokens.
- middleware.ts — auth/routing.
- supabase/migrations — DB schema.

## Conventions
- Server-only service role key; never anon for privileged writes.
- No raw AI errors to users; failover + friendly messages.
- Telemetry redacts secrets; dedups by signature in incident_logs.
