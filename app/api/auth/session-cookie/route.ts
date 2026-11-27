/**
 * /api/auth/session-cookie — sets/clears the HttpOnly `anvik_session` cookie.
 *
 * Middleware cannot read localStorage, so ANVIK's verified session (which the
 * browser keeps in `anvik-session` localStorage and sends as `Authorization:
 * Bearer <token>` on API calls) is mirrored into an HttpOnly cookie that the
 * edge middleware can inspect. This is what lets middleware redirect an
 * unauthenticated visitor from a protected page to /login *before* any page
 * JavaScript runs.
 *
 * POST verifies the bearer token against Supabase and, only when valid, sets
 * the cookie. A cookie therefore always represents a session that was once
 * verified by Supabase — middleware can trust its presence as the auth gate.
 * DELETE clears it (sign-out).
 */

import { NextResponse } from "next/server";

function supabaseOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    ""
  ).replace(/\/+$/, "");
}

function supabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    ""
  );
}

function cookieOptions(clear = false): Record<string, unknown> {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    // When clearing, maxAge 0 deletes the cookie immediately.
    ...(clear ? { maxAge: 0 } : { maxAge: 60 * 60 * 24 * 7 }), // 7 days
  } as Record<string, unknown>;
}

export async function POST(request: Request): Promise<Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const url = supabaseOrigin();
  const key = supabaseAnonKey();
  if (!url || !key) {
    return NextResponse.json({ error: "Auth is not configured" }, { status: 500 });
  }

  // Verify the token with Supabase before minting the cookie. A cookie is only
  // ever set for a token Supabase accepts as a live session.
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Could not verify session" }, { status: 502 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("anvik_session", token, cookieOptions());
  return res;
}

export async function DELETE(): Promise<Response> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("anvik_session", "", cookieOptions(true));
  return res;
}
