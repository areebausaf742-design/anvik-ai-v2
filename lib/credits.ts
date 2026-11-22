/**
 * Server-side per-user credit system — the multi-user enforcement half of
 * ANVIK. All privileged operations run through the service role; the browser
 * never writes balances, limits or plans.
 *
 * Data model (see migration 20261123000000_multi_user_credits.sql):
 *   user_entitlements — one row per user: plan, daily limit, status, expiry
 *   credit_balances   — one row per user: pack credits, daily usage, reset
 *   credit_ledger     — append-only audit trail of every spending event
 *   usage_events      — append-only per-request outcomes (auditability)
 *
 * Atomicity lives in the `reserve_credit` Postgres function: a row lock, an
 * IST-day reset, a daily spend or a pack fallback — one transaction, so two
 * concurrent requests from the same user can never spend the same final
 * credit. Idempotency: the client sends a unique request reference; an
 * already-used reference is refused without spending.
 */

import { istDay } from "@/lib/quota";
import { planById, type PlanId } from "@/lib/plans";
import { sbRpc, sbSelect, sbUpsert } from "@/lib/supabase";

export type CreditSource = "daily" | "pack" | "none";

export type CreditReservation = {
  ok: boolean;
  source: CreditSource;
  reason: string | null;
  used: number;
  remaining: number;
  packRemaining: number;
};

export type UserEntitlement = {
  user_id: string;
  plan_id: "free" | "pack" | "daily" | "yearly";
  daily_message_limit: number;
  current_plan_status: "active" | "expired" | "pending";
  entitlement_start: string;
  entitlement_expiry: string | null;
};

export type UserBalance = {
  user_id: string;
  available_pack_credits: number;
  daily_usage: number;
  daily_limit: number;
  last_reset_at: string;
  pack_credits_expires_at: string | null;
};

function entitlementExpired(row: UserEntitlement, now = Date.now()): boolean {
  if (row.entitlement_expiry == null) return false;
  const expiry = Date.parse(row.entitlement_expiry);
  if (!Number.isFinite(expiry)) return false;
  return expiry < now;
}

/** A free user keeps the free entitlement; everyone gets a row lazily. */
export async function ensureEntitlement(userId: string, initialPlan: PlanId = "free"): Promise<UserEntitlement | null> {
  if (!userId) return null;
  const rows = await sbSelect<UserEntitlement>(
    "user_entitlements",
    `user_id=eq.${encodeURIComponent(userId)}&select=user_id,plan_id,daily_message_limit,current_plan_status,entitlement_start,entitlement_expiry&limit=1`,
  );
  const existing = rows?.[0] ?? null;
  if (existing) return existing;

  const plan = planById(initialPlan);
  const dailyLimit = plan.questionsPerDay ?? 0; // pack: no daily cap
  const start = new Date();
  const expiry = plan.validityDays ? new Date(start.getTime() + plan.validityDays * 86_400_000) : null;
  const row: UserEntitlement = {
    user_id: userId,
    plan_id: initialPlan === "pack" ? "pack" : initialPlan,
    daily_message_limit: dailyLimit,
    current_plan_status: "active",
    entitlement_start: start.toISOString(),
    entitlement_expiry: expiry ? expiry.toISOString() : null,
  };
  const ok = await sbUpsert("user_entitlements", [row]);
  if (!ok) return null;
  return row;
}

/** Effective plan after expiry — never expires silently into "free". */
export function effectivePlan(row: UserEntitlement | null): { plan: PlanId; limit: number; active: boolean } {
  if (!row) return { plan: "free", limit: 10, active: true };
  const spec = planById(row.plan_id);
  const expired = entitlementExpired(row) || row.current_plan_status !== "active";
  if (expired) {
    // Never better than free — expired plans degrade to the free floor.
    if (row.plan_id === "free") return { plan: "free", limit: 10, active: true };
    return { plan: "free", limit: 10, active: true };
  }
  if (spec.questionsPerDay != null) return { plan: spec.id, limit: spec.questionsPerDay, active: true };
  // Pack plan: no daily limit; pack credits are the allowance.
  return { plan: "pack", limit: 0, active: true };
}

/**
 * Reserve one credit for the user. Returns the reservation result, never throws.
 * The caller is responsible for refunding on failure (refundCredit).
 */
export async function reserveCredit(
  userId: string,
  dailyLimit: number,
  reference: string,
): Promise<CreditReservation> {
  const result = await sbRpc<Record<string, unknown>>("reserve_credit", {
    p_user_id: userId,
    p_daily_limit: dailyLimit,
    p_reference: reference,
  });
  if (!result) {
    return { ok: false, source: "none", reason: "unavailable", used: 0, remaining: 0, packRemaining: 0 };
  }
  const ok = result.ok === true;
  return {
    ok,
    source: ok ? (result.source as CreditSource) : "none",
    reason: typeof result.reason === "string" ? result.reason : null,
    used: typeof result.used === "number" ? result.used : 0,
    remaining: typeof result.remaining === "number" ? result.remaining : 0,
    packRemaining: typeof result.pack_remaining === "number" ? result.pack_remaining : 0,
  };
}

export async function refundCredit(userId: string, source: "daily" | "pack", reference: string): Promise<boolean> {
  if (!userId || (source !== "daily" && source !== "pack")) return false;
  const result = await sbRpc<unknown>("refund_credit", {
    p_user_id: userId,
    p_source: source,
    p_reference: reference,
  });
  return result === true;
}

export async function recordUsage(
  userId: string,
  source: "daily" | "pack" | "none",
  reference: string,
  model: string,
  feature: string,
  inputTokens: number | null,
  outputTokens: number | null,
  status: "success" | "failure" | "refund" | "aborted" = "success",
): Promise<boolean> {
  const result = await sbRpc<unknown>("record_usage", {
    p_user_id: userId,
    p_source: source,
    p_reference: reference,
    p_model: model,
    p_feature: feature,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_status: status,
  });
  return result != null;
}

/** Fresh balance + effective plan for a signed-in user (server-side). */
export async function readCredits(userId: string) {
  const [entitlement, balance, todayDay] = await Promise.all([
    ensureEntitlement(userId),
    sbSelect<UserBalance>(
      "credit_balances",
      `user_id=eq.${encodeURIComponent(userId)}&select=user_id,available_pack_credits,daily_usage,daily_limit,last_reset_at,pack_credits_expires_at&limit=1`,
    ),
    Promise.resolve(istDay()),
  ]);

  const effective = effectivePlan(entitlement);
  const balanceRow = balance?.[0] ?? null;

  const isNewDay =
    !balanceRow || istDay(new Date(balanceRow.last_reset_at)) !== todayDay;
  const dailyLimit = entitlement?.daily_message_limit ?? effective.limit;
  const dailyUsed = isNewDay ? 0 : (balanceRow?.daily_usage ?? 0);
  const packRemaining = balanceRow?.available_pack_credits ?? 0;
  const packExpiry = balanceRow?.pack_credits_expires_at ?? null;

  const eff = effectivePlan(entitlement);
  const isPackOnly = eff.plan === "pack";
  const isDailyCap = entitlement != null && entitlement.daily_message_limit > 0;
  const remaining = isPackOnly
    ? packRemaining
    : isDailyCap
      ? Math.max(0, dailyLimit - dailyUsed)
      : // pack only inside a daily plan: daily remaining + pack fallback
        Math.max(0, dailyLimit - dailyUsed) + packRemaining;

  return {
    plan: eff.plan,
    planName: planById(eff.plan).name,
    active: eff.active,
    entitlement_expiry: entitlement?.entitlement_expiry ?? null,
    daily_used: dailyUsed,
    daily_limit: dailyLimit,
    daily_remaining: isPackOnly ? 0 : Math.max(0, dailyLimit - dailyUsed),
    pack_remaining: packRemaining,
    pack_expires_at: packExpiry,
    remaining,
    status: eff.active ? "active" : "expired",
  };
}

export type UsageEventRow = {
  id: string;
  model: string | null;
  feature_used: string | null;
  credits_consumed: number;
  request_status: string;
  created_at: string;
};

export type LedgerRow = {
  id: string;
  transaction_type: string;
  credit_amount: number;
  description: string | null;
  created_at: string;
};

export async function readUsageHistory(userId: string, limit = 12): Promise<UsageEventRow[]> {
  const rows = await sbSelect<UsageEventRow>(
    "usage_events",
    `user_id=eq.${encodeURIComponent(userId)}&select=id,model,feature_used,credits_consumed,request_status,created_at&order=created_at.desc&limit=${limit}`,
  );
  return rows ?? [];
}

export async function readLedger(userId: string, limit = 12): Promise<LedgerRow[]> {
  const rows = await sbSelect<LedgerRow>(
    "credit_ledger",
    `user_id=eq.${encodeURIComponent(userId)}&select=id,transaction_type,credit_amount,description,created_at&order=created_at.desc&limit=${limit}`,
  );
  return rows ?? [];
}
