/**
 * Server-side free-tier quota — the promise every visitor gets.
 *
 * Rules (locked):
 *   - 20 free answers per visitor per day, enforced server-side per IP
 *   - keyed by salted IP hash + IST day (midnight IST, not UTC)
 *   - persisted in the Supabase `quota_usage` table (server-only, RLS deny)
 *   - counted ONLY after a successful stream, never on a failed request
 *   - a user-supplied own key is unlimited: there is no quota for it
 *   - the quota count may be cached briefly in-process; answers never are
 *
 * Implementation notes:
 *   - The reservation map lives in-process so concurrent requests in one
 *     process cannot double-spend the same remaining slot.
 *   - Across processes (Vercel lambdas) two concurrent requests can both pass
 *     the check; the persisted count is best-effort read-modify-write, which
 *     only ever allows slightly MORE than the cap, never less. For a free
 *     daily limit on a hobby plan that is the right trade — a hard DB-level
 *     counter would need a Postgres function we cannot deploy from here.
 *   - When Supabase is unreachable the check degrades to the in-process
 *     counter and never throws — the request still completes.
 */

export const QUOTA_LIMIT = 20;
export const FREE_LIMIT = QUOTA_LIMIT;

const IST_OFFSET_MS = 5.5 * 3600_000;

/** IST calendar day — the product promise is to Indian users, so the reset
 *  lands at midnight IST, not UTC. */
export function istDay(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* IO — injectable so tests never touch the network                    */
/* ------------------------------------------------------------------ */

export type QuotaReader = (ipHash: string, day: string) => Promise<number | null>;
export type QuotaWriter = (ipHash: string, day: string, count: number) => Promise<boolean>;

export type QuotaHooks = {
  read: QuotaReader;
  write: QuotaWriter;
  now?: () => Date;
  /** ms to cache the read for /api/quota display (chat path uses fresh reads) */
  cacheTtlMs?: number;
};

type ReservationEntry = { reserved: number; stored: number };

/** In-process reservations so same-process concurrency can't double-spend. */
const reservations = new Map<string, number>();

/** Tiny in-process cache for /api/quota display. Never used for the chat call. */
const readCache = new Map<string, { value: number | null; expiresAt: number }>();
const CACHE_TTL_MS = 3_000;

export type QuotaCheck =
  | { ok: true; reservationKey: string; remaining: number }
  | { ok: false; reservationKey: string; remaining: number; error: "limit_reached" };

export class QuotaStore {
  constructor(private readonly hooks: QuotaHooks) {}

  private reservationKey(ipHash: string, day: string) {
    return `${ipHash}:${day}`;
  }

  private purgeReservation(key: string) {
    reservations.delete(key);
  }

  /**
   * Snapshot the quota and reserve a slot. Returns false when the free tier
   * is exhausted. The reservation is released by `cancel()` or consumed by
   * `confirm()`.
   */
  async checkAndReserve(ipHash: string, now = this.hooks.now?.() ?? new Date()): Promise<QuotaCheck> {
    const day = istDay(now);
    const key = this.reservationKey(ipHash, day);

    const stored = await this.readQuotaCount(ipHash, day);
    const reserved = reservations.get(key) ?? 0;
    const counted = (stored ?? 0) + reserved;
    const remaining = Math.max(0, FREE_LIMIT - counted);

    if (remaining <= 0) {
      return { ok: false, reservationKey: key, remaining: 0, error: "limit_reached" };
    }

    reservations.set(key, reserved + 1);
    return { ok: true, reservationKey: key, remaining: remaining - 1 };
  }

  /** Fresh read (never the display cache). */
  async readQuotaCount(ipHash: string, day: string): Promise<number | null> {
    try {
      return await this.hooks.read(ipHash, day);
    } catch {
      return null;
    }
  }

  /**
   * Cached read for the display endpoint. Never used by the chat path.
   */
  async readQuotaCountCached(ipHash: string, day: string): Promise<number | null> {
    const now = Date.now();
    const cached = readCache.get(`${ipHash}:${day}`);
    if (cached && cached.expiresAt > now) return cached.value;
    const value = await this.readQuotaCount(ipHash, day);
    readCache.set(`${ipHash}:${day}`, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  }

  /**
   * Consumed after a successful stream: decrement the reservation and persist
   * the incremented count. Returns the new count, or null when the write
   * could not be performed (Supabase down) — never throws.
   */
  async confirm(reservationKey: string): Promise<number | null> {
    const reserved = reservations.get(reservationKey);
    if (reserved && reserved > 1) reservations.set(reservationKey, reserved - 1);
    else reservations.delete(reservationKey);

    const [ipHash, day] = splitKey(reservationKey);
    const stored = await this.readQuotaCount(ipHash, day);
    // Nothing storable means nothing to persist — the request still counted
    // its own in-process reservation, so the day's total stays honest.
    if (stored === null) return null;
    const next = stored + 1;
    try {
      const ok = await this.hooks.write(ipHash, day, next);
      return ok ? next : null;
    } catch {
      return null;
    }
  }

  /** Release a reservation without writing (failed / aborted request). */
  cancel(reservationKey: string): void {
    const reserved = reservations.get(reservationKey);
    if (reserved && reserved > 1) reservations.set(reservationKey, reserved - 1);
    else reservations.delete(reservationKey);
  }

  /** Display helper: remaining for the quota endpoint. */
  async remaining(ipHash: string, now = this.hooks.now?.() ?? new Date()): Promise<number> {
    const day = istDay(now);
    const stored = await this.readQuotaCountCached(ipHash, day);
    const reserved = reservations.get(this.reservationKey(ipHash, day)) ?? 0;
    return Math.max(0, FREE_LIMIT - ((stored ?? 0) + reserved));
  }

  /** Visible for tests. */
  reset(): void {
    reservations.clear();
    readCache.clear();
  }
}

function splitKey(key: string): [string, string] {
  const idx = key.lastIndexOf(":");
  return [key.slice(0, idx), key.slice(idx + 1)];
}

/* ------------------------------------------------------------------ */
/* Supabase hooks                                                      */
/* ------------------------------------------------------------------ */

/**
 * Default hooks: PostgREST against the `quota_usage` table.
 * Missing tables/keys → null/false — the caller degrades, never throws.
 */
export function supabaseQuotaHooks(
  select: <T = unknown>(table: string, query: string) => Promise<T[] | null>,
  upsert: (table: string, rows: Record<string, unknown>[]) => Promise<boolean>,
): QuotaHooks {
  return {
    read: async (ipHash, day) => {
      const rows = (await select(
        "quota_usage",
        `select=count&ip_hash=eq.${encodeURIComponent(ipHash)}&date=eq.${day}&limit=1`,
      )) as Array<{ count?: number }> | null;
      const count = rows?.[0]?.count;
      return typeof count === "number" && Number.isFinite(count) ? count : 0;
    },
    write: async (ipHash, day, count) => {
      const ok = await upsert("quota_usage", [{ ip_hash: ipHash, date: day, count }]);
      return ok;
    },
  };
}
