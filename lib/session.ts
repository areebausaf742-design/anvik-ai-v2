/**
 * Server-side session verification — the trust boundary for every protected
 * route in ANVIK.
 *
 * The client sends its Supabase access token as `Authorization: Bearer <token>`.
 * This module validates the token with Supabase on every request (never trusts
 * client-supplied identity, email or plan) and returns the verified user. The
 * anon key is used only with the user's own token — it can never act as the
 * service role.
 *
 * Every protected server path passes through here before it touches user data,
 * credit balances, consent or entitlements.
 */

export type VerifiedUser = {
  id: string;
  email: string;
  name: string;
  provider: "google" | "email" | "unknown";
  avatarUrl: string | null;
};

const SUPABASE_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ""
).replace(/\/+$/, "");

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";

export function authConfigured(): boolean {
  return Boolean(SUPABASE_URL && ANON_KEY);
}

function readBearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function displayNameFromMetadata(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return "";
  const raw =
    typeof metadata.name === "string" ? metadata.name
    : typeof metadata.full_name === "string" ? metadata.full_name
    : typeof metadata.given_name === "string" ? metadata.given_name
    : "";
  return raw.trim().slice(0, 80);
}

function providerFromMetadata(metadata: Record<string, unknown> | undefined): "google" | "email" | "unknown" {
  if (!metadata) return "unknown";
  const provider = typeof metadata.provider === "string" ? metadata.provider : "";
  if (/google/i.test(provider)) return "google";
  return "email";
}

/**
 * The auth provider lives in app_metadata (the canonical, immutable place) —
 * user_metadata carries the provider-specific claims (name, picture, email)
 * but NOT the provider itself. Key off app_metadata, then fall back to
 * user_metadata for legacy shapes.
 */
function providerOf(obj: Record<string, unknown>): "google" | "email" | "unknown" {
  const app = (obj.app_metadata ?? {}) as Record<string, unknown>;
  const appProvider = typeof app.provider === "string" ? app.provider : "";
  if (/google/i.test(appProvider)) return "google";
  if (typeof appProvider === "string" && appProvider.trim()) return "email";
  const providers = Array.isArray(app.providers) ? (app.providers as unknown[]) : [];
  if (providers.some((p) => typeof p === "string" && /google/i.test(p))) return "google";
  const user = (obj.user_metadata ?? {}) as Record<string, unknown>;
  return providerFromMetadata(user);
}

function safeAvatar(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  const raw = metadata.picture ?? metadata.avatar_url;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^https:\/\//i.test(trimmed)) return null;
  return trimmed.slice(0, 512);
}

/**
 * Validate the request's bearer token against Supabase Auth. Returns the
 * verified user, or null for an invalid/missing/expired token. Never throws.
 */
export async function getVerifiedUser(request: Request): Promise<VerifiedUser | null> {
  if (!authConfigured()) return null;
  const token = readBearer(request);
  if (token.length < 10) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const body = await response.json().catch(() => null);
    const obj = (body ?? {}) as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id : "";
    if (!id) return null;
    const email = typeof obj.email === "string" ? obj.email.trim().toLowerCase() : "";
    const userMetadata = (obj.user_metadata ?? {}) as Record<string, unknown>;
    const appMetadata = (obj.app_metadata ?? {}) as Record<string, unknown>;
    const name = displayNameFromMetadata(userMetadata) || displayNameFromMetadata(appMetadata);
    return {
      id,
      email: email.slice(0, 256),
      name,
      provider: providerOf(obj),
      avatarUrl: safeAvatar(userMetadata) || safeAvatar(appMetadata),
    };
  } catch {
    return null;
  }
}

/**
 * Cheap bearer gate: only performs the Supabase user-verification round-trip
 * when the request actually carries an Authorization: Bearer header. Returns
 * the verified user, or null for guests / invalid tokens. Never trusts a
 * client-supplied identity (device id, email, plan) — only the verified
 * token. Never throws.
 */
export async function getVerifiedUserIfPresent(request: Request): Promise<VerifiedUser | null> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return getVerifiedUser(request).catch(() => null);
}

/**
 * Helper for "require auth" routes — returns the user or a 401 response.
 *
 * `feature` names the surface in the refusal so the UI can say what specifically
 * needs an account ("Image generation needs an account") instead of one blanket
 * sentence. The `code` is always `unauthenticated`, which is what clients switch
 * on — the wording is presentation only.
 */
export async function requireUser(
  request: Request,
  feature?: string,
): Promise<{ user: VerifiedUser } | { response: Response }> {
  const user = await getVerifiedUser(request);
  if (!user) {
    return {
      response: Response.json(
        {
          error: feature
            ? `${feature} needs an account. Sign in to continue — it's free.`
            : "You must be signed in.",
          code: "unauthenticated",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
  return { user };
}

/** Sanitize a client-supplied display name for storage. */
export function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // Strip control characters and HTML-ish tags; keep letters, spaces, basic punctuation.
  const cleaned = raw
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, 80);
  return cleaned;
}

/**
 * Derive a readable first-name fallback from an email address.
 * Example: "ravi237@gmail.com" becomes "Ravi". This is display-only;
 * authentication and authorization always use the verified Supabase user id.
 */
export function emailFallbackName(email: string): string {
  const local = email.split("@")[0]?.trim().toLowerCase();
  if (!local) return "Friend";
  const part = local.replace(/[^a-z0-9._-]/g, " ").trim();
  if (!part) return "Friend";
  const rawFirst = part.replace(/[._-]+/g, " ").split(" ").filter(Boolean)[0] ?? "";
  const first = rawFirst.replace(/\d+$/, "").slice(0, 24);
  if (!first) return "Friend";
  return first.charAt(0).toLocaleUpperCase("en-US") + first.slice(1);
}

/**
 * Convert a verified profile name into the short welcome greeting.
 * A full display name is intentionally reduced to its first word.
 */
export function greetingFirstName(displayName: unknown, email: string): string {
  const safeDisplayName = sanitizeDisplayName(displayName);
  const candidate = safeDisplayName && !safeDisplayName.includes("@")
    ? safeDisplayName
    : emailFallbackName(email);
  const first = candidate.trim().split(/\s+/)[0]?.replace(/\d+$/, "").slice(0, 24) ?? "";
  if (!first) return emailFallbackName(email);
  return first.charAt(0).toLocaleUpperCase("en-US") + first.slice(1);
}
