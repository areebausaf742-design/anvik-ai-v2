/**
 * /api/quota — the caller's live allowance, computed server-side.
 *
 * Every AI route now requires a verified user, and the only meter that is
 * actually charged is the per-account credit ledger (`reserve_credit` /
 * `settle_credit`). This endpoint therefore reports the account view, and
 * reports a signed-out caller as `unauthenticated` instead of inventing a free
 * per-IP allowance that nothing enforces any more.
 *
 * Why the per-IP branch is gone rather than kept "for compatibility": the free
 * counter was frozen for its entire life (the dead-upsert bug), and the chat
 * route no longer charges it. Reporting `remaining: 10` from a counter that
 * nobody increments would be a lie in the one place users look to see what they
 * have left.
 *
 * Response (locked contract — the chat UI reads hasServerKey/status/remaining):
 *   { "hasServerKey": true, "status": "ok", "remaining": X,
 *     "googleStatus": 200, "modelUsed": "gemini-2.5-flash", "limit": 10,
 *     "plan": { "id": "free", "name": "Free", ... }, "userId": "…" }
 */

import { MODEL_FALLBACK_CHAIN, validateGeminiServerKey } from "@/lib/gemini";
import { serverKey } from "@/lib/provider";
import { planById, type PlanId } from "@/lib/plans";
import { requireUser } from "@/lib/session";
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
  // One identity model: a verified account. Guests are refused instead of being
  // handed a free allowance that no route would honour.
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const verified = auth.user;

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
      userId: verified.id,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
