/**
 * GET /api/auth/me — the caller's verified identity + account state.
 *
 * Every field here is computed server-side from the verified token (never from
 * client-supplied identity or plan). The browser uses this for the avatar chip,
 * dashboard header and the account screen.
 */

import { requireUser, sanitizeDisplayName, emailFallbackName } from "@/lib/session";
import { sbSelect, sbUpsert } from "@/lib/supabase";
import { ensureEntitlement, readCredits, readUsageHistory, readLedger } from "@/lib/credits";
import { readConsent } from "@/lib/consent";
import { planById } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  provider: string;
  account_status: string;
  terms_accepted_at: string | null;
  privacy_accepted_at: string | null;
  ai_improvement_consent: boolean;
  ai_improvement_consent_at: string | null;
  consent_withdrawal_at: string | null;
  created_at: string;
};

async function ensureProfile(user: { id: string; email: string; name: string; provider: string; avatarUrl: string | null }): Promise<ProfileRow | null> {
  const rows = await sbSelect<ProfileRow>(
    "user_profiles",
    `user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`,
  );
  const existing = rows?.[0] ?? null;
  if (existing) return existing;

  const displayName = sanitizeDisplayName(user.name) || emailFallbackName(user.email) || "friend";
  const row = {
    user_id: user.id,
    email: user.email,
    display_name: displayName,
    avatar_url: user.avatarUrl,
    provider: user.provider === "google" ? "google" : "email",
    account_status: "active",
    terms_accepted_at: null,
    privacy_accepted_at: null,
    ai_improvement_consent: false,
    ai_improvement_consent_at: null,
  };
  const ok = await sbUpsert("user_profiles", [row], "user_id");
  return ok ? ({ ...row, created_at: new Date().toISOString() } as ProfileRow) : null;
}

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const profile = await ensureProfile({ ...user, provider: user.provider });
  const entitlement = await ensureEntitlement(user.id).catch(() => null);
  const credits = await readCredits(user.id).catch(() => null);
  // null means "could not read", which the client must render as retryable —
  // NOT as "has not consented" (that would re-prompt for acceptance already
  // given). `consentReadable` makes the distinction explicit on the wire.
  let consent = null as Awaited<ReturnType<typeof readConsent>> | null;
  let consentReadable = true;
  try {
    consent = await readConsent(user.id);
  } catch {
    consentReadable = false;
  }
  const usage = await readUsageHistory(user.id, 6).catch(() => []);
  const ledger = await readLedger(user.id, 6).catch(() => []);

  const planMeta = planById(credits?.plan ?? "free");

  return Response.json(
    {
      user: {
        id: user.id,
        email: user.email,
        name: profile?.display_name ?? user.name ?? emailFallbackName(user.email),
        provider: profile?.provider ?? user.provider,
        avatarUrl: profile?.avatar_url ?? user.avatarUrl,
        createdAt: profile?.created_at ?? new Date().toISOString(),
        accountStatus: profile?.account_status ?? "active",
      },
      entitlement: {
        planId: credits?.plan ?? "free",
        planName: credits?.planName ?? planMeta.name,
        status: credits?.status ?? (entitlement?.current_plan_status ?? "active"),
        expiry: credits?.entitlement_expiry ?? null,
      },
      credits: credits
        ? {
            dailyLimit: credits.daily_limit,
            dailyUsed: credits.daily_used,
            dailyRemaining: credits.daily_remaining,
            packRemaining: credits.pack_remaining,
            packExpiry: credits.pack_expires_at,
            totalRemaining: credits.remaining,
          }
        : null,
      consent: consent ?? null,
      consentReadable,
      usage: usage.map((u) => ({
        id: u.id,
        model: u.model,
        feature: u.feature_used,
        status: u.request_status,
        createdAt: u.created_at,
      })),
      ledger: ledger.map((l) => ({
        id: l.id,
        type: l.transaction_type,
        amount: l.credit_amount,
        description: l.description,
        createdAt: l.created_at,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
