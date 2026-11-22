/**
 * /api/quota — free-tier and plan-entitlement status, computed server-side.
 *
 * The client calls this before sending a message; the chat route re-checks
 * the same quota server-side and counts it only after a successful stream.
 *
 * Free quota (per IP, IST day, Supabase quota_usage) is enforced with
 * quota_usage. Paid-plan entitlements (pack/daily/yearly) are enforced with
 * the entitlements ledger — keyed by device, written only by an operator
 * through the admin grant endpoint. Expired or exhausted paid entitlements
 * fall back to the free per-IP quota honestly.
 *
 * Response (locked contract — the chat UI reads hasServerKey/status/remaining):
 *   { "hasServerKey": true, "status": "ok", "remaining": X,
 *     "googleStatus": 200, "modelUsed": "gemini-2.5-flash", "limit": 10,
 *     "plan": { "id": "free", "name": "Free", "priceInr": 0, "validityDays": null,
 *               "expiresAt": null, "packTotal": null, "packUsed": null } }
 */

import { MODEL_FALLBACK_CHAIN, validateGeminiServerKey } from "@/lib/gemini";
import { serverKey } from "@/lib/provider";
import { QuotaStore, supabaseQuotaHooks, FREE_LIMIT } from "@/lib/quota";
import { EntitlementsStore, supabaseEntitlementHooks } from "@/lib/entitlements";
import { planById, type PlanId } from "@/lib/plans";
import { sbSelect, sbUpsert } from "@/lib/supabase";
import { hashIp } from "@/lib/security";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const quota = new QuotaStore(supabaseQuotaHooks(sbSelect, sbUpsert));
const entitlements = new EntitlementsStore(supabaseEntitlementHooks(sbSelect, (rows) => sbUpsert("entitlements", rows)));

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
  const ipHash = hashIp(clientIp(request));
  const rawDeviceId = (request.headers.get("x-anvik-device") ?? "").trim().slice(0, 128);
  const configuredKey = serverKey();
  const hasServerKey = Boolean(configuredKey);

  // Only ever "invalid" when Google explicitly says the key is not valid.
  const validation = configuredKey
    ? await validateGeminiServerKey(configuredKey)
    : { googleStatus: null, invalid: false };

  // Resolve the effective plan first — the paid entitlement beats the free
  // per-IP quota while it has allowance left. An active-but-exhausted
  // entitlement falls back to the free quota (Free is the floor, never
  // below), so the reported numbers match what /api/chat will actually do.
  const entitlementRow = rawDeviceId ? await entitlements.resolve(rawDeviceId, false) : null;
  let remaining: number;
  let limit: number;
  let planMeta: QuotaPlanMeta;
  const tally = entitlementRow ? await entitlements.remaining(rawDeviceId) : null;
  if (tally && tally.remaining > 0) {
    remaining = tally.remaining;
    limit = tally.limit;
    planMeta = paidPlanMeta(entitlementRow!);
  } else {
    remaining = hasServerKey ? await quota.remaining(ipHash) : FREE_LIMIT;
    limit = FREE_LIMIT;
    planMeta = freePlanMeta();
  }

  const status = !hasServerKey
    ? "not_configured"
    : validation.invalid
      ? "invalid_server_key"
      : remaining <= 0
        ? "limit_reached"
        : "ok";

  return Response.json({
    hasServerKey,
    status,
    remaining: Math.max(0, remaining),
    googleStatus: validation.googleStatus,
    modelUsed: MODEL_FALLBACK_CHAIN[0],
    limit,
    plan: planMeta,
  });
}
