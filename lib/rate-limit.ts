/**
 * In-process sliding-window limiter (plan §6.2) shared by every AI route.
 *
 * /api/ask had this and the paid Gemini routes did not, so a script could
 * loop /api/chat and /api/image against a server key for free (audit H-1).
 * Limits are per client identity: cookie device id when present, else IP.
 *
 * Vercel's edge sets x-vercel-forwarded-for; x-forwarded-for is only used as a
 * fallback and the LAST hop is taken, because the leftmost hop is attacker
 * controlled (audit H-8).
 */

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

/** Visible for tests only. */
export function _resetRateLimits(): void {
  hits.clear();
  lastSpacing.clear();
}

export const LIMIT_MESSAGE =
  "Too many requests from this device. Please wait a minute and try again.";
