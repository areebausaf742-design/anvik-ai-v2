/**
 * In-process sliding-window limiter (plan §6.2) shared by every AI route.
 *
 * /api/ask had this and the five paid Gemini routes did not, so a script could
 * loop /api/chat and /api/image against a server key for free (audit H-1).
 * Limits are per client identity: cookie device id when present, else IP.
 *
 * Vercel's edge sets x-vercel-forwarded-for; x-forwarded-for is only used as a
 * fallback and the LAST hop is taken, because the leftmost hop is attacker
 * controlled (audit H-8).
 */

const hits = new Map<string, number[]>();

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

export const LIMIT_MESSAGE =
  "Too many requests from this device. Please wait a minute and try again.";
