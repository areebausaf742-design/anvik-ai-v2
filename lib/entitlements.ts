/**
 * Server-side plan entitlements for paid plans — the enforcement half of
 * the ANVIK pricing story. Free is enforced separately (lib/quota.ts, per IP).
 *
 * Design (locked):
 *  - one row per device (device_id = the client's x-anvik-device header)
 *  - rows are written only by the admin grant endpoint (or before activation)
 *    — never by the browser, never by the free tier
 *  - pack: 50 questions total, valid 30 days from activation
 *  - daily/yearly: 50 questions per IST day, valid 30 / 365 days
 *  - expired rows degrade gracefully to the free tier — they are never
 *    silently extended or renewed
 *  - daily questions reset at midnight IST (same day key as the free tier)
 *  - counted only AFTER a successful stream (same as the free tier)
 *  - in-process reservations prevent double-spend within one process;
 *    the persisted row is best-effort read-modify-write across processes
 *    (same accepted trade-off as quota_usage)
 *
 * Supabase schema: see supabase/migrations/20261122000001_entitlements.sql
 */

import { istDay } from "@/lib/quota";
import { planById, type PlanId } from "@/lib/plans";

export const PACK_TOTAL_QUESTIONS = 50;
export const DAILY_LIMIT = 50;

export type EntitlementRow = {
  device_id: string;
  plan: "pack" | "daily" | "yearly";
  activated_at: string;
  expires_at: string;
  pack_total: number | null;
  pack_used: number;
  daily_day: string | null;
  daily_used: number;
};

export type EntitlementHooks = {
  read: (deviceId: string) => Promise<EntitlementRow | null>;
  write: (row: EntitlementRow) => Promise<boolean>;
  now?: () => Date;
  cacheTtlMs?: number;
};

type Outcome =
  | { kind: "free" } // resolve to the free per-IP quota
  | { kind: "blocked"; deviceId: string; plan: PlanId; remaining: number }
  | { kind: "reserved"; deviceId: string; plan: PlanId; remaining: number };

const DEFAULT_CACHE_TTL = 3_000;

async function safeInvoke<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Clamp a row to the plan's exact spec validity: even if a row was granted
 * with a longer expires_at (operator error or corruption), it can never
 * outlive the plan's 30/365-day window.
 */
function clampExpiry(row: EntitlementRow): EntitlementRow {
  const activated = Date.parse(row.activated_at);
  const validityDays = row.plan === "pack" || row.plan === "daily" ? 30 : 365;
  const specExpiry = new Date(activated + validityDays * 86_400_000);
  const rowExpiry = Date.parse(row.expires_at);
  if (!Number.isFinite(rowExpiry)) return { ...row, expires_at: specExpiry.toISOString() };
  if (rowExpiry > specExpiry.getTime()) return { ...row, expires_at: specExpiry.toISOString() };
  return row;
}

function normalizeRow(raw: EntitlementRow): EntitlementRow {
  const expiresAt = Date.parse(raw.expires_at);
  const activatedAt = Date.parse(raw.activated_at);
  const normalized: EntitlementRow = {
    device_id: String(raw.device_id ?? "").slice(0, 128),
    plan: (["pack", "daily", "yearly"] as const).includes(raw.plan) ? raw.plan : "daily",
    activated_at: Number.isFinite(activatedAt) ? new Date(activatedAt).toISOString() : new Date().toISOString(),
    expires_at: Number.isFinite(expiresAt) ? new Date(expiresAt).toISOString() : new Date(0).toISOString(),
    pack_total: raw.plan === "pack" ? Number(raw.pack_total ?? PACK_TOTAL_QUESTIONS) : null,
    pack_used: Math.max(0, Number(raw.pack_used ?? 0)),
    daily_day: typeof raw.daily_day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.daily_day) ? raw.daily_day : null,
    daily_used: Math.max(0, Number(raw.daily_used ?? 0)),
  };
  return clampExpiry(normalized);
}

export class EntitlementsStore {
  private readonly hooks: EntitlementHooks;
  /** In-process reservations: deviceId → count. */
  private readonly reservations = new Map<string, number>();
  private readonly readCache = new Map<string, { value: EntitlementRow | null; expiresAt: number }>();

  constructor(hooks: EntitlementHooks) {
    this.hooks = hooks;
  }

  private cacheTtl() {
    return this.hooks.cacheTtlMs ?? DEFAULT_CACHE_TTL;
  }

  private now(): Date {
    return this.hooks.now?.() ?? new Date();
  }

  /** Fresh read for enforcement paths. */
  async getRow(deviceId: string, fresh: boolean): Promise<EntitlementRow | null> {
    const key = deviceId;
    let value: EntitlementRow | null = null;

    if (!fresh) {
      const cached = this.readCache.get(key);
      if (cached && cached.expiresAt > Date.now()) return cached.value;
    }
    const raw = await safeInvoke(() => this.hooks.read(deviceId), null);
    if (raw) {
      const normalized = normalizeRow(raw);
      if (normalized.device_id && normalized.device_id === deviceId) {
        value = normalized;
      }
    }
    if (!fresh) {
      this.readCache.set(key, { value, expiresAt: Date.now() + this.cacheTtl() });
    }
    return value;
  }

  /** Resolve the active entitlement (or null when none / expired). */
  async resolve(deviceId: string, fresh = true): Promise<EntitlementRow | null> {
    const row = await this.getRow(deviceId, fresh);
    if (!row) return null;
    if (Date.parse(row.expires_at) <= this.now().getTime()) return null;
    // An exhausted pack or an exhausted daily allowance resolves to the row —
    // the caller decides whether to block (that is the paid plan's own cap).
    return row;
  }

  private freshRowForPath(row: EntitlementRow, now: Date): EntitlementRow {
    // daily reset: different IST day → zero today
    if (row.plan !== "pack") {
      const day = istDay(now);
      if (row.daily_day !== day) {
        return { ...row, daily_day: day, daily_used: 0 };
      }
    }
    return row;
  }

  /**
   * Reserve one slot against the device's entitlement. Returns a discriminated
   * outcome; the caller falls back to the free quota for "free", and uses
   * "blocked" for the 429.
   */
  async reserve(deviceId: string): Promise<Outcome> {
    const now = this.now();
    const row = await this.resolve(deviceId, true);
    if (!row) return { kind: "free" };

    const pending = this.reservations.get(deviceId) ?? 0;
    const today = this.freshRowForPath(row, now);

    if (row.plan === "pack") {
      const total = row.pack_total ?? PACK_TOTAL_QUESTIONS;
      const remaining = total - (today.pack_used ?? 0) - pending;
      if (remaining <= 0) return { kind: "blocked", deviceId, plan: "pack", remaining: 0 };
      this.reservations.set(deviceId, pending + 1);
      return { kind: "reserved", deviceId, plan: "pack", remaining: remaining - 1 };
    }

    const limit = DAILY_LIMIT;
    const usedToday = today.daily_used ?? 0;
    const remaining = limit - usedToday - pending;
    if (remaining <= 0) return { kind: "blocked", deviceId, plan: row.plan as PlanId, remaining: 0 };
    this.reservations.set(deviceId, pending + 1);
    return { kind: "reserved", deviceId, plan: row.plan as PlanId, remaining: remaining - 1 };
  }

  /** Confirm a reservation after a successful stream. Releases the slot. */
  async confirm(deviceId: string): Promise<EntitlementRow | null> {
    const pending = this.reservations.get(deviceId) ?? 0;
    if (pending > 1) this.reservations.set(deviceId, pending - 1);
    else this.reservations.delete(deviceId);

    const now = this.now();
    // Fresh read so we don't clobber a simultaneous write from another process.
    const row = await this.getRow(deviceId, true);
    if (!row) return null;
    const day = istDay(now);

    if (row.plan === "pack") {
      const packUsed = row.pack_used + 1;
      const updated: EntitlementRow = { ...row, pack_used: packUsed, daily_day: null, daily_used: 0 };
      const ok = await safeInvoke(() => this.hooks.write(updated), false);
      this.readCache.delete(deviceId);
      return ok ? updated : null;
    }

    // daily / yearly
    const today = row.daily_day === day ? row.daily_used + 1 : 1;
    const dailyDay = row.daily_day === day ? row.daily_day : day;
    const updated: EntitlementRow = { ...row, daily_day: dailyDay, daily_used: today };
    const ok = await safeInvoke(() => this.hooks.write(updated), false);
    this.readCache.delete(deviceId);
    return ok ? updated : null;
  }

  /** Release a reservation without writing (failed / aborted request). */
  cancel(deviceId: string): void {
    const pending = this.reservations.get(deviceId) ?? 0;
    if (pending > 1) this.reservations.set(deviceId, pending - 1);
    else this.reservations.delete(deviceId);
  }

  /**
   * Admin grant path: upsert the entitlement with a fresh activation day.
   * Caller is expected to have authenticated the operator. Returns the row.
   */
  async grant(
    deviceId: string,
    plan: "pack" | "daily" | "yearly",
    opts: { activatedAt?: string } = {},
  ): Promise<EntitlementRow | null> {
    const trimmed = deviceId.trim();
    if (trimmed.length < 4 || trimmed.length > 128) return null;
    const now = this.now();
    const spec = planById(plan);
    const activatedAt = opts.activatedAt ?? now.toISOString();
    const activated = Date.parse(activatedAt);
    const activatedSafe = Number.isFinite(activated) ? activated : now.getTime();
    const validityDays = spec.validityDays ?? 30;
    const expiresAt = new Date(activatedSafe + validityDays * 86_400_000).toISOString();
    const row: EntitlementRow = {
      device_id: trimmed,
      plan,
      activated_at: new Date(activatedSafe).toISOString(),
      expires_at: expiresAt,
      pack_total: plan === "pack" ? (spec.totalQuestions ?? PACK_TOTAL_QUESTIONS) : null,
      pack_used: 0,
      daily_day: plan === "pack" ? null : istDay(new Date(activatedSafe)),
      daily_used: 0,
    };
    const ok = await safeInvoke(() => this.hooks.write(row), false);
    if (!ok) return null;
    this.readCache.delete(deviceId);
    return row;
  }

  /** Cached read for the display endpoint. */
  async remaining(deviceId: string): Promise<{ remaining: number; limit: number } | null> {
    const row = await this.resolve(deviceId, false);
    if (!row) return null;
    const pending = this.reservations.get(deviceId) ?? 0;
    if (row.plan === "pack") {
      const total = row.pack_total ?? PACK_TOTAL_QUESTIONS;
      return { remaining: Math.max(0, total - (row.pack_used ?? 0) - pending), limit: total };
    }
    const today = this.freshRowForPath(row, this.now());
    const used = (today.daily_used ?? 0) + pending;
    return { remaining: Math.max(0, DAILY_LIMIT - used), limit: DAILY_LIMIT };
  }

  /** Direct read used by the display endpoint (no in-process reservations). */
  async summary(deviceId: string): Promise<EntitlementRow | null> {
    const row = await this.resolve(deviceId, false);
    if (!row) return null;
    return this.freshRowForPath(row, this.now());
  }

  reset() {
    this.reservations.clear();
    this.readCache.clear();
  }
}

/* ------------------------------------------------------------------ */
/* Supabase hooks                                                      */
/* ------------------------------------------------------------------ */

export function supabaseEntitlementHooks(
  select: <T = unknown>(table: string, query: string) => Promise<T[] | null>,
  write: (rows: Record<string, unknown>[]) => Promise<boolean>,
): EntitlementHooks {
  return {
    read: async (deviceId) => {
      const rows = (await select(
        "entitlements",
        `select=device_id,plan,activated_at,expires_at,pack_total,pack_used,daily_day,daily_used&device_id=eq.${encodeURIComponent(deviceId)}&limit=1`,
      )) as EntitlementRow[] | null;
      return rows?.[0] ?? null;
    },
    write: async (row) => {
      const ok = await write([
        {
          device_id: row.device_id,
          plan: row.plan,
          activated_at: row.activated_at,
          expires_at: row.expires_at,
          pack_total: row.pack_total,
          pack_used: row.pack_used,
          daily_day: row.daily_day,
          daily_used: row.daily_used,
        },
      ]);
      return ok;
    },
  };
}
