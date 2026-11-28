import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** First-party device id for the legacy IP-quota fallback; never a fingerprint. */
function deviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function setDeviceCookie(res: NextResponse, existing: string | undefined): NextResponse {
  if (existing) return res;
  res.cookies.set("anvik_dev", deviceId(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

/**
 * All app pages are guest-accessible. The SessionProvider creates a unique
 * anonymous Supabase identity after hydration; protected APIs still require a
 * server-verified Supabase bearer token and their own rate/credit checks.
 */
const SESSION_REQUIRED_API_ROUTES = new Set([
  "/api/image",
  "/api/code",
  "/api/voice",
  "/api/vision",
]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/apple-icon" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    if (SESSION_REQUIRED_API_ROUTES.has(pathname) && !req.cookies.get("anvik_session")?.value) {
      return NextResponse.json(
        { error: "Your guest session is starting. Please retry in a moment.", code: "guest_session_initializing" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.next();
  }

  // No page redirects to /login: every visitor can open every workspace route.
  return setDeviceCookie(NextResponse.next(), req.cookies.get("anvik_dev")?.value);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon).*)"],
};
