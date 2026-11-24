/**
 * /api/quota — the caller's live allowance, computed server-side.
 *
 * Two meters exist, and this endpoint reports whichever one is actually being
 * charged for the caller:
 *
 *   - a verified account: the credit ledger (`reserve_credit`/`settle_credit`)
 *   - a guest: the ten-answers-a-day IP allowance in lib/guest-quota.ts, which
 *     `/api/chat` genuinely charges
 *
 * A guest is therefore a first-class answer, not a 401. Returning
 * `unauthenticated` made every signed-out caller — including the Settings page
 * and the chat composer — render an invented "10 left / no server key" state
 * from a catch block, which read as a service outage.
 *
 * `hasServerKey` is still reported honestly: if the deployment has no key, a
 * guest cannot be served at all and the UI must say so instead of pretending.
 *
 * Response (locked contract — the chat UI reads hasServerKey/status/remaining):
 *   { "hasServerKey": true, "status": "ok", "remaining": X,
 *     "googleStatus": 200, "modelUsed": "gemini-2.5-flash", "limit": 10,
 *     "plan": { "id": "free", "name": "Free", ... }, "userId": "…" }
 */

import { MODEL_FALLBACK_CHAIN, validateGeminiServerKey } from "@/lib/gemini";
import { serverKey } from "@/lib/provider";
import { planById, type PlanId } from "@/lib/plans";
import { getVerifiedUserIfPresent } from "@/lib/session";
import { readGuestAllowance } from "@/lib/guest-quota";
import { readCredits } from "@/lib/credits";
import { FREE_DAILY_LIMIT } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


type QuotaPlanMeta = {
  id: PlanId;
  name: string;
  priceInr: number;
  validityDays: number | null;
  expiresAt: string | null;
  packTotal: number | null;
  packUsed: number | null;
};

function freePlanMeta(): QuotaPlanMeta {
  return {
    id: "free",
    name: "Free",
    priceInr: 0,
    validityDays: null,
    expiresAt: null,
    packTotal: null,
    packUsed: null,
  };
}

function paidPlanMeta(row: { plan: "pack" | "daily" | "yearly"; expires_at: string; pack_total: number | null; pack_used: number }): QuotaPlanMeta {
  const spec = planById(row.plan);
  return {
    id: spec.id as PlanId,
    name: spec.name,
    priceInr: spec.priceInr,
    validityDays: spec.validityDays,
    expiresAt: row.expires_at,
    packTotal: row.pack_total ?? (spec.id === "pack" ? 50 : null),
    packUsed: row.pack_total != null ? row.pack_used : null,
  };
}

export async function GET(request: Request) {
  // Resolve identity without demanding it: a guest is a supported caller.
  const verified = await getVerifiedUserIfPresent(request).catch(() => null);

  if (!verified) {
    // Guest view — the same meter `/api/chat` charges.
    const hasServerKey = Boolean(serverKey());
    const allowance = await readGuestAllowance(request);
    return Response.json(
      {
        hasServerKey,
        status: !hasServerKey ? "not_configured" : allowance.remaining <= 0 ? "limit_reached" : "ok",
        remaining: allowance.remaining,
        limit: allowance.limit,
        googleStatus: null,
        modelUsed: MODEL_FALLBACK_CHAIN[0],
        plan: {
          id: "guest",
          name: "Guest",
          priceInr: 0,
          validityDays: null,
          expiresAt: null,
          packTotal: null,
          packUsed: null,
        },
        // Lets the UI say "resets at midnight IST" instead of guessing.
        resetsOn: allowance.day,
        authenticated: false,
        userId: null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const configuredKey = serverKey();
  const hasServerKey = Boolean(configuredKey);
  const validation = configuredKey
    ? await validateGeminiServerKey(configuredKey)
    : { googleStatus: null, invalid: false };

  const credits = await readCredits(verified.id).catch(() => null);
  const isPack = credits?.plan === "pack";
  const limit = isPack ? (credits?.pack_remaining ?? 0) : (credits?.daily_limit ?? FREE_DAILY_LIMIT);
  const remaining = isPack ? (credits?.pack_remaining ?? 0) : (credits?.daily_remaining ?? 0);

  const status = !hasServerKey
    ? "not_configured"
    : validation.invalid
      ? "invalid_server_key"
      : remaining <= 0
        ? "limit_reached"
        : "ok";

  const planId = (credits?.plan ?? "free") as PlanId;
  const spec = planById(planId);
  const planMeta: QuotaPlanMeta = {
    id: planId,
    name: credits?.planName ?? spec.name,
    priceInr: spec.priceInr,
    validityDays: spec.validityDays,
    expiresAt: credits?.entitlement_expiry ?? null,
    // readCredits exposes the remaining/limit pair; total = used + remaining
    // for a pack, so derive it instead of inventing a second source of truth.
    packTotal: isPack ? (spec.totalQuestions ?? null) : null,
    packUsed: isPack ? Math.max(0, (spec.totalQuestions ?? 0) - (credits?.pack_remaining ?? 0)) : null,
  };

  return Response.json(
    {
      hasServerKey,
      status,
      remaining: Math.max(0, remaining),
      googleStatus: validation.googleStatus,
      modelUsed: MODEL_FALLBACK_CHAIN[0],
      limit,
      plan: planMeta,
      authenticated: true,
      userId: verified.id,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
