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
import { sbSelect, sbUpsert } from "@/lib/supabase";
import { planById, type PlanId } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const entitlements = new EntitlementsStore(supabaseEntitlementHooks(sbSelect, (rows) => sbUpsert("entitlements", rows)));

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

  const { deviceId, plan, activatedAt } = body as {
    deviceId?: unknown;
    plan?: unknown;
    activatedAt?: unknown;
  };

  if (typeof deviceId !== "string" || deviceId.trim().length < 4 || deviceId.trim().length > 128) {
    return json({ error: "deviceId must be a string of 4–128 characters.", code: "bad_device" }, 400);
  }
  if (typeof plan !== "string" || !NON_FREE_PLANS.has(plan)) {
    return json({ error: "plan must be one of: pack, daily, yearly.", code: "bad_plan" }, 400);
  }
  const safePlan = plan as "pack" | "daily" | "yearly";
  const safeActivatedAt =
    typeof activatedAt === "string" && !Number.isNaN(Date.parse(activatedAt)) ? activatedAt : undefined;

  const row = await entitlements.grant(deviceId.trim(), safePlan, { activatedAt: safeActivatedAt });
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
