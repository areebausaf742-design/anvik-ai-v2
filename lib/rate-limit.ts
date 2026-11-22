/**
 * Distributed rate limiting for every AI-route endpoint, with an in-memory
 * fallback for cold starts, local development and deliberate outages.
 *
 * Identity model — server-trusted only:
 *  - authenticated requests are keyed by their VERIFIED user id
 *    (`user:<uuid>`), never by a client-supplied identity header
 *  - guest requests are keyed by the effective IP derived from server-set
 *    headers (x-vercel-forwarded-for; x-forwarded-for's last hop as fallback,
 *    because the leftmost hop is attacker controlled — the original H-8
 *    audit finding)
 *  - the client-supplied x-anvik-device header is NEVER used for rate limiting
 *
 * The bucket keys stored in `rate_limit_buckets` are opaque SHA-256 digests,
 * so neither IPs nor user identifiers are written to the database.
 *
 * The distributed path uses the existing server-side Supabase RPC
 * `consume_rate_limit` (see supabase/migrations/20261122160403_*.sql), which is
 * atomic per bucket (single upsert inside one transaction) and is retained
 * for bucket cleanup of rows older than seven days.
 *
 * Failure policy — deliberate, graceful degradation: if Supabase is not
 * configured, or the RPC fails/times out, the bounded in-memory limiter
 * (the original audit behaviour) still applies the same caps. The product
 * never goes unprotected because the database is unreachable; the limiting is
 * only weaker (per instance, not global) during that outage.
 */

import { createHash } from "node:crypto";
import { sbRpc } from "@/lib/supabase";

const hits = new Map<string, number[]>();
const lastSpacing = new Map<string, number>();

export function clientIp(request: Request): string {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]?.trim() || "unknown";
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((h) => h.trim()).filter(Boolean);
    return hops[hops.length - 1] ?? "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "local";
}

export function clientIdentity(request: Request, deviceId?: string | null): string {
  return deviceId ? `dev:${deviceId}` : `ip:${clientIp(request)}`;
}

/** Returns true when the caller is under both the per-minute and per-hour cap. */
export function allow(identity: string, perMin = 6, perHour = 40): boolean {
  const now = Date.now();
  const list = (hits.get(identity) ?? []).filter((t) => now - t < 3_600_000);
  const inMinute = list.filter((t) => now - t < 60_000).length;
  if (inMinute >= perMin || list.length >= perHour) {
    hits.set(identity, list);
    return false;
  }
  list.push(now);
  hits.set(identity, list);
  return true;
}

/** Hourly cap only — used by /api/ask, which keeps its own minute window. */
export function hourlyCount(identity: string): number {
  const now = Date.now();
  return (hits.get(identity) ?? []).filter((t) => now - t < 3_600_000).length;
}

/* ------------------------------------------------------------------ */
/* per-IP rate limit: min spacing + per-minute cap                     */
/* ------------------------------------------------------------------ */

export type SpacingDecision =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number; reason: "spacing" | "per_minute" };

/**
 * The /api/chat rate limit: at most one request per `minSpacingMs` and at most
 * `perMinute` per minute per IP. Spacing is tracked independently of the
 * minute window so a flood of rapid hits cannot walk past the per-minute cap
 * by slow-slotting.
 */
export function allowPerIp(
  identity: string,
  minSpacingMs: number,
  perMinute: number,
  now = Date.now(),
): SpacingDecision {
  // Min spacing between requests.
  const last = lastSpacing.get(identity) ?? 0;
  if (last > 0 && now - last < minSpacingMs) {
    return { allowed: false, retryAfterMs: minSpacingMs - (now - last), reason: "spacing" };
  }

  const list = (hits.get(identity) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= perMinute) {
    hits.set(identity, list);
    return { allowed: false, retryAfterMs: 60_000, reason: "per_minute" };
  }

  hits.set(identity, [...list, now]);
  lastSpacing.set(identity, now);
  return { allowed: true };
}

/* ------------------------------------------------------------------ */
/* distributed limiter — the production path                            */
/* ------------------------------------------------------------------ */

type RpcConsumeResult = {
  allowed?: boolean;
  remaining?: number;
  retry_after_seconds?: number;
};

function bucketKey(scope: string, kind: string, seed: string, window: "minute" | "hour" | "spacing"): string {
  return createHash("sha256")
    .update(`${scope}::${kind}::${seed}::${window}`, "utf8")
    .digest("hex");
}

/** The verified-or-IP identity for a request — never a client-supplied header. */
export function rateLimitIdentity(request: Request, verifiedUserId?: string | null): { kind: "user" | "ip"; seed: string } {
  if (verifiedUserId) return { kind: "user", seed: verifiedUserId };
  return { kind: "ip", seed: clientIp(request) };
}

export type DistributedDecision = {
  /** Whether the request may proceed. */
  allowed: boolean;
  /** Remaining calls in the minute window (0 when denied or in fallback). */
  remaining: number;
  /** How long the caller should wait before retrying. */
  retryAfterMs: number;
  /** "distributed" when the Supabase RPC decided; "memory" on outage fallback. */
  source: "distributed" | "memory";
};

async function callConsumeRpc(bucket: string, limit: number, windowSeconds: number): Promise<RpcConsumeResult | null> {
  try {
    return await sbRpc<RpcConsumeResult>("consume_rate_limit", {
      p_bucket_key: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
  } catch {
    return null;
  }
}

/**
 * The production rate limit for an AI route.
 *
 * - `verifiedUserId` — the VERIFIED Supabase user id (from getVerifiedUser),
 *   never the x-anvik-device header, never a supplied identity.
 * - guest callers are keyed by effective IP.
 * - Fails deliberately to the bounded in-memory limiter when Supabase is
 *   unreachable or unconfigured — the endpoint is never unprotected.
 *
 * Returns an object with `allowed` and the retry hint; never throws.
 */
export async function allowDistributed(
  request: Request,
  scope: string,
  perMinute: number,
  perHour: number,
  options: { verifiedUserId?: string | null; spacingMs?: number } = {},
): Promise<DistributedDecision> {
  const identity = rateLimitIdentity(request, options.verifiedUserId);
  const seed = identity.seed || "unknown";
  const inMemoryKey = `${scope}:${identity.kind}:${seed}`;

  const minuteKey = bucketKey(scope, identity.kind, seed, "minute");
  const hourKey = perHour > 0 ? bucketKey(scope, identity.kind, seed, "hour") : null;
  const spacingKey =
    options.spacingMs && options.spacingMs > 0
      ? bucketKey(scope, identity.kind, seed, "spacing")
      : null;

  const [minuteRes, hourRes, spacingRes] = await Promise.all([
    callConsumeRpc(minuteKey, perMinute, 60),
    hourKey ? callConsumeRpc(hourKey, perHour, 3600) : Promise.resolve(null),
    spacingKey && options.spacingMs
      ? callConsumeRpc(spacingKey, 1, Math.max(1, Math.ceil(options.spacingMs / 1000)))
      : Promise.resolve(null),
  ]);

  // Failure means "the RPC itself failed" (null) — never a well-formed reply.
  // The hour window is skipped (hourKey null) only when the route has no cap.
  const minuteFailed = minuteRes === null;
  const hourFailed = hourKey !== null && hourRes === null;
  const spacingFailed = spacingKey !== null && spacingRes === null;

  if (minuteFailed || hourFailed || spacingFailed) {
    // Deliberate graceful degradation — outage or unconfigured Supabase.
    if (options.spacingMs && options.spacingMs > 0) {
      const mem = allowPerIp(inMemoryKey, options.spacingMs, perMinute);
      return { allowed: mem.allowed, remaining: 0, retryAfterMs: mem.allowed ? 0 : mem.retryAfterMs, source: "memory" };
    }
    const mem = allow(inMemoryKey, perMinute, perHour > 0 ? perHour : perMinute * 10);
    return { allowed: mem, remaining: 0, retryAfterMs: mem ? 0 : 60_000, source: "memory" };
  }

  const denied =
    minuteRes.allowed === false ||
    (hourRes !== null && hourRes.allowed === false) ||
    (spacingRes !== null && spacingRes.allowed === false);

  if (denied) {
    const retrySeconds = Math.max(
      minuteRes.retry_after_seconds ?? 0,
      hourRes?.retry_after_seconds ?? 0,
      spacingRes?.retry_after_seconds ?? 0,
    );
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(1000, retrySeconds * 1000), source: "distributed" };
  }

  return {
    allowed: true,
    remaining: Math.min(
      minuteRes.remaining ?? 0,
      hourRes?.remaining ?? minuteRes.remaining ?? 0,
    ),
    retryAfterMs: 0,
    source: "distributed",
  };
}

/** Visible for tests only. */
export function _resetRateLimits(): void {
  hits.clear();
  lastSpacing.clear();
}

export const LIMIT_MESSAGE =
  "Too many requests from this device. Please wait a minute and try again.";
