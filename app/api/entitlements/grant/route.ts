/**
 * POST /api/entitlements/grant — operator-only paid-plan activation.
 *
 * Paid plans are activated through WhatsApp enquiry: the user sends the
 * pre-filled message to the ANVIK number; an operator authenticates here and
 * grants the entitlement for the device the user identified. There is no
 * online payment — this endpoint is the activation path, not a PSP.
 *
 * Auth: the x-anvik-admin-token header must equal ANVIK_ADMIN_TOKEN (env).
 * The token never leaves the server; no anon access exists.
 *
 * Body: { deviceId: string, plan: "pack" | "daily" | "yearly", activatedAt?: ISOString }
 * Success: 200 { plan, deviceId, expiresAt, packTotal? }
 */

import { EntitlementsStore, supabaseEntitlementHooks } from "@/lib/entitlements";
import { sbRpc, sbSelect, sbUpdateWhereDetailed, sbUpsert } from "@/lib/supabase";
import { planById, type PlanId } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const entitlements = new EntitlementsStore(supabaseEntitlementHooks(sbSelect, (rows) => sbUpsert("entitlements", rows, "device_id")));

const NON_FREE_PLANS = new Set<string>(["pack", "daily", "yearly"]);

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function POST(request: Request) {
  const configured = process.env.ANVIK_ADMIN_TOKEN?.trim();
  if (!configured) {
    return json({ error: "ANVIK_ADMIN_TOKEN is not configured on the server.", code: "grant_not_configured" }, 503);
  }

  const supplied = request.headers.get("x-anvik-admin-token")?.trim() ?? "";
  if (!supplied || !constantTimeEqual(supplied, configured)) {
    return json({ error: "Unauthorized.", code: "unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send a valid JSON body.", code: "bad_body" }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ error: "Send a valid JSON body.", code: "bad_body" }, 400);
  }

  const { deviceId, userId, plan, activatedAt } = body as {
    deviceId?: unknown;
    userId?: unknown;
    plan?: unknown;
    activatedAt?: unknown;
  };

  // Either a device (legacy pricing flow) or a verified user id (per-user
  // system). Exactly one is required — the grant is scoped to that identity.
  const hasDevice = typeof deviceId === "string" && deviceId.trim().length >= 4 && deviceId.trim().length <= 128;
  // RFC 4122 UUID: 8-4-4-4-12 hex groups (v1-v5). The previous pattern
  // (36 contiguous hex chars) never matched any real UUID.
  const hasUser = typeof userId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId.trim());
  if (!hasDevice && !hasUser) {
    return json({ error: "deviceId or a userId is required.", code: "bad_device" }, 400);
  }
  if (hasDevice && hasUser) {
    return json({ error: "Pass either deviceId or userId, not both.", code: "bad_device" }, 400);
  }
  if (typeof plan !== "string" || !NON_FREE_PLANS.has(plan)) {
    return json({ error: "plan must be one of: pack, daily, yearly.", code: "bad_plan" }, 400);
  }
  const safePlan = plan as "pack" | "daily" | "yearly";
  const safeActivatedAt =
    typeof activatedAt === "string" && !Number.isNaN(Date.parse(activatedAt)) ? activatedAt : undefined;

  // --- per-user grant (multi-user system) ---
  if (hasUser) {
    const targetUserId = (userId as string).trim();
    const spec = planById(safePlan);
    const activated = safeActivatedAt ?? new Date().toISOString();
    const validityDays = spec.validityDays ?? 30;
    const expiry = new Date(Date.parse(activated) + validityDays * 86_400_000);
    const dailyLimit = spec.questionsPerDay ?? 0;

    // 1. Per-user entitlement row (upsert by primary key).
    const entitlementRow = {
      user_id: targetUserId,
      plan_id: safePlan,
      daily_message_limit: dailyLimit,
      current_plan_status: "active",
      entitlement_start: activated,
      entitlement_expiry: expiry.toISOString(),
    };
    const entitlementOk = await sbUpsert("user_entitlements", [entitlementRow], "user_id");
    if (!entitlementOk) {
      return json({ error: "Could not persist the entitlement — check server configuration.", code: "grant_failed" }, 500);
    }

    // 2. Pack credits (one-time total questions) go onto the balance; pack
    //    users get zero daily cap (they spend pack credits only).
    //
    //    The old code was a JS read-modify-write with no idempotency, so a
    //    retried grant could double-credit or lose credits to a lost update.
    //    `grant_pack_credits` locks the balance row and applies a given
    //    reference exactly once; a replay returns applied:false and the
    //    balance is unchanged. The ledger entry is written by the same
    //    function, so the audit row can never drift from the balance.
    if (safePlan === "pack") {
      const packTotal = spec.totalQuestions ?? 50;
      // The reference is stable per (user, plan, activation instant) so an
      // operator retry of the SAME request is a no-op, while a deliberate
      // second purchase (different `activatedAt`) still adds credits.
      const grantReference = `grant:${targetUserId}:${safePlan}:${activated}`;
      const granted = await sbRpc<{ ok?: boolean; applied?: boolean; replayed?: boolean; available_pack_credits?: number }>(
        "grant_pack_credits",
        {
          p_user_id: targetUserId,
          p_credits: packTotal,
          p_reference: grantReference,
          p_description: `${spec.name} pack granted`,
          p_expires_at: expiry.toISOString(),
        },
      );
      if (!granted || granted.ok !== true) {
        return json({ error: "Could not persist the pack credits — check server configuration.", code: "grant_failed" }, 500);
      }
    }

    // 3. Daily plans (daily/yearly) open a fresh window: reset today's usage and
    //    set the new cap.
    //
    //    This is a COLUMN-SCOPED update, not a whole-row upsert. The old code
    //    rewrote the row and set `available_pack_credits: 0`, so buying a daily
    //    plan silently deleted pack credits the user had paid for; a filtered
    //    UPDATE that names only these columns cannot touch them at all.
    if (safePlan === "daily" || safePlan === "yearly") {
      const reset = await sbUpdateWhereDetailed(
        "credit_balances",
        `user_id=eq.${encodeURIComponent(targetUserId)}`,
        {
          daily_usage: 0,
          daily_limit: dailyLimit,
          last_reset_at: activated,
          updated_at: activated,
        },
      );
      // No row yet is fine (created lazily on first spend); any other failure
      // means the grant did not fully apply, so say so instead of returning 200.
      if (!reset.ok && reset.error.category !== "table_missing") {
        return json(
          { error: "Granted the plan but could not reset today's usage. Retry the grant.", code: "grant_partial" },
          500,
        );
      }
    }

    return json({
      plan: safePlan,
      name: spec.name,
      userId: targetUserId,
      expiresAt: expiry.toISOString(),
      packTotal: safePlan === "pack" ? (spec.totalQuestions ?? 50) : null,
    });
  }

  // --- legacy device grant (unchanged) ---
  const row = await entitlements.grant((deviceId as string).trim(), safePlan, { activatedAt: safeActivatedAt });
  if (!row) {
    return json(
      { error: "Could not persist the entitlement — check server configuration.", code: "grant_failed" },
      500,
    );
  }

  const spec = planById(safePlan as PlanId);
  return json({
    plan: safePlan,
    name: spec.name,
    deviceId: row.device_id,
    expiresAt: row.expires_at,
    packTotal: row.pack_total ?? null,
  });
}
