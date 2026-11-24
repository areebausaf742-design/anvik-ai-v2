/**
 * /api/profile — verified-user profile management.
 *
 * POST — update the caller's display name and avatar (server-validated).
 * GET — the caller's profile (best-effort; created lazily).
 *
 * Always uses the verified bearer token for identity; never trusts a
 * client-supplied user id. Avatar URLs are validated to https.
 */

import { requireUser, sanitizeDisplayName, emailFallbackName } from "@/lib/session";
import { sbSelect, sbUpsert } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeAvatar(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^https:\/\//i.test(trimmed)) return null;
  return trimmed.slice(0, 512);
}

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const rows = await sbSelect<{ display_name: string | null; avatar_url: string | null; provider: string }>(
    "user_profiles",
    `user_id=eq.${encodeURIComponent(user.id)}&select=display_name,avatar_url,provider&limit=1`,
  );
  const row = rows?.[0] ?? null;
  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      name: row?.display_name ?? user.name ?? emailFallbackName(user.email),
      avatarUrl: row?.avatar_url ?? user.avatarUrl,
      provider: row?.provider ?? user.provider,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a valid JSON body.", code: "bad_body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Send a valid JSON body.", code: "bad_body" }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const name = sanitizeDisplayName(payload.name ?? payload.displayName);
  const avatar = safeAvatar(payload.avatarUrl);

  if (!name) {
    return Response.json(
      { error: "Display name must be 1–80 characters.", code: "bad_name" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const ok = await sbUpsert("user_profiles", [
    {
      user_id: user.id,
      email: user.email,
      display_name: name,
      avatar_url: avatar,
      provider: user.provider === "google" ? "google" : "email",
      account_status: "active",
      updated_at: now,
    },
  ], "user_id");
  if (!ok) {
    // One retry with the least required row: the profile may already exist.
    const retry = await sbUpsert("user_profiles", [
      {
        user_id: user.id,
        display_name: name,
        avatar_url: avatar,
        updated_at: now,
      },
    ], "user_id");
    if (!retry) {
      return Response.json({ error: "Could not save your profile. Please try again.", code: "profile_failed" }, { status: 500 });
    }
  }

  return Response.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name,
      avatarUrl: avatar,
      provider: user.provider,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
