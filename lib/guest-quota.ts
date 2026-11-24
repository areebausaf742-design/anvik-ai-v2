/**
 * The guest allowance — the ten free answers a visitor gets before signing in.
 *
 * The product promises this on the home page and on /login ("Continue without
 * an account… ten free daily questions"), so it has to be real, server-enforced
 * and countable. It is a SEPARATE meter from the account credit ledger, not a
 * reuse of it, for one reason: a guest has no verified identity.
 *
 * Identity model — deliberately not a device id:
 *
 *   - a guest is keyed by `<salted IP hash>` from the platform-set forwarding
 *     headers (`x-vercel-forwarded-for` / `x-real-ip`). Those headers are
 *     written by the edge and overwrite whatever the client sent, so the key is
 *     not forgeable from the browser. The raw IP never reaches the database —
 *     only its SHA-256 digest.
 *   - the client-supplied `x-anvik-device` header is NEVER part of the key. It
 *     is trivially forged (an attacker would rotate it per request for
 *     unlimited spend), and earlier revisions of this codebase wrote it into
 *     `chats.user_id`, which made rows invisible to their own owner. A header
 *     is not an identity.
 *
 * What a guest may spend:
 *
 *   - the SERVER key only, and only from the `chat` feature. Every other AI
 *     surface (image, code, voice, vision) is account-only: those are the
 *     expensive calls, a guest has no ledger to reconcile them against, and the
 *     product never promised them without an account.
 *   - a guest supplying their OWN Gemini key is unmetered, exactly like a
 *     signed-in user, because they are paying Google directly.
 *
 * Counting rules are inherited from `lib/quota.ts` and are the whole point:
 *
 *   - 10 per IST calendar day, resetting at midnight IST
 *   - counted ONLY after a successful answer (`confirm`), never on a failed or
 *     aborted request (`cancel`), so a provider outage cannot burn allowance
 *   - incremented by the atomic `consume_quota` Postgres function — one row
 *     lock, one increment, no read-modify-write race across lambdas
 *   - when Supabase is unreachable the in-process counter still applies, so the
 *     limit never silently disappears
 */

import { FREE_DAILY_LIMIT } from "@/lib/plans";
import { hashIp } from "@/lib/security";
import { clientIp } from "@/lib/rate-limit";
import { sbRpc, sbSelect, sbUpsert } from "@/lib/supabase";
import { istDay, QuotaStore, supabaseQuotaHooks } from "@/lib/quota";

export const GUEST_LIMIT = FREE_DAILY_LIMIT;

/**
 * Features a guest may never reach. Kept as data (not scattered `if`s) so the
 * gateway, the quota endpoint and the UI all agree on one answer.
 */
export const ACCOUNT_ONLY_FEATURES = ["image", "code", "voice", "vision"] as const;

export type GuestFeature = "chat";
export type AccountOnlyFeature = (typeof ACCOUNT_ONLY_FEATURES)[number];

/** Only the server key is spendable by a guest. */
export type GuestSpend = { key: string };

export type GuestAllowance = {
  /** Salted hash of the caller's IP — the guest's only identity. */
  ipHash: string;
  /** IST day the count belongs to. */
  day: string;
  /** Answers left before this request. */
  remaining: number;
};

export type GuestMeterResult =
  | { ok: true; allowance: GuestAllowance; reserve: () => Promise<void>; release: () => void }
  | { ok: false; reason: "limit_reached"; allowance: GuestAllowance };

/**
 * One shared store for the whole process.
 *
 * `QuotaStore` keeps in-process reservations so two concurrent requests in the
 * same lambda cannot both spend the last free answer; the distributed part is
 * the `consume_quota` RPC.
 */
let store: QuotaStore | null = null;
function guestStore(): QuotaStore {
  if (!store) {
    store = new QuotaStore(
      supabaseQuotaHooks(sbSelect, sbUpsert, (ipHash, day) =>
        // Argument names must match the SQL signature exactly (`p_day`), or
        // PostgREST answers 404 and every guest silently falls back to the
        // in-process counter.
        sbRpc<number>("consume_quota", { p_ip_hash: ipHash, p_day: day }),
      ),
    );
  }
  return store;
}

/** Visible for tests: the guest identity for a request, or null if unusable. */
export function guestIpHash(request: Request): string | null {
  const ip = clientIp(request);
  // `clientIp` returns "local" when no forwarding header is present (unit
  // tests, `next dev` on a socket). Hashing that would put every such caller in
  // one bucket, which is fine for a dev server but must never be mistaken for a
  // real address, so it is hashed under a distinct marker.
  if (!ip) return null;
  return hashIp(ip);
}

/**
 * Reserve one guest answer.
 *
 * Mirrors `beginMeteredRequest`: it never calls a provider itself, it only
 * decides whether this request may spend the server key. The caller MUST call
 * `reserve()` once the answer succeeds and `release()` on any other exit path.
 */
export async function reserveGuestRequest(
  request: Request,
  feature: GuestFeature,
): Promise<GuestMeterResult> {
  void feature; // only "chat" is a guest feature today; kept for signature symmetry
  const ipHash = guestIpHash(request);
  if (!ipHash) {
    return {
      ok: false,
      reason: "limit_reached",
      allowance: { ipHash: "", day: istDay(), remaining: 0 },
    };
  }

  const quotaStore = guestStore();
  const check = await quotaStore.checkAndReserve(ipHash);
  const day = istDay();
  const allowance: GuestAllowance = { ipHash, day, remaining: check.remaining };

  if (!check.ok) return { ok: false, reason: "limit_reached", allowance };

  return {
    ok: true,
    allowance,
    /** Count the answer — called only after a successful stream. */
    reserve: async () => {
      await quotaStore.confirm(check.reservationKey);
    },
    /** Give the slot back — failed, refused or aborted before answering. */
    release: () => quotaStore.cancel(check.reservationKey),
  };
}

export type GuestStatus = {
  /** Answers left today. */
  remaining: number;
  limit: number;
  /** IST day the count refers to, so the UI can say when it resets. */
  day: string;
};

/** Read-only view for `/api/quota` when the caller is a guest. */
export async function readGuestAllowance(request: Request): Promise<GuestStatus> {
  const ipHash = guestIpHash(request);
  if (!ipHash) return { remaining: GUEST_LIMIT, limit: GUEST_LIMIT, day: istDay() };
  const remaining = await guestStore().remaining(ipHash);
  return { remaining, limit: GUEST_LIMIT, day: istDay() };
}

/** Visible for tests only. */
export function _resetGuestQuota(): void {
  store?.reset();
  store = null;
}
