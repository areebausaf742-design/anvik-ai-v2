import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Device identity without accounts (plan §6.2).
 * A first-party id in an HttpOnly cookie, cross-checked against a
 * localStorage id client-side. Not a fingerprint: no canvas, font or
 * UA fingerprinting anywhere in this product.
 *
 * `crypto.randomUUID` is not guaranteed in the Edge runtime, so the id is
 * built from Web Crypto directly — a missing global here 500s every first
 * visit (audit C-3).
 */
function deviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Where Supabase sends an OAuth return when `redirect_to` is not allow-listed.
 * Keep these in sync with `OAUTH_CALLBACK_PATH` in lib/auth.ts.
 */
const AUTH_CALLBACK_PATH = "/login";

/**
 * Rescue an authorization code that landed on the wrong page.
 *
 * Supabase replaces an unlisted `redirect_to` with the project's Site URL. On
 * this project the Site URL is the root, so the `?code=` that Google produced
 * arrives at `/`, where nothing exchanges it — the user sits at the homepage,
 * unauthenticated, with no explanation. Rather than depend on the dashboard
 * staying perfectly aligned with app code, forward any code-carrying request on
 * a non-callback page to /login, which knows how to finish the flow.
 *
 * Only the presence of `code` is inspected here; the value is passed through
 * untouched and is never logged. The PKCE verifier still decides whether the
 * exchange can succeed.
 */
function redirectCallbackToLogin(req: NextRequest): NextResponse | null {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname === AUTH_CALLBACK_PATH) return null;
  if (!searchParams.has("code")) return null;
  if (pathname.startsWith("/api/")) return null;
  const target = req.nextUrl.clone();
  target.pathname = AUTH_CALLBACK_PATH;
  target.search = "";
  for (const [key, value] of searchParams) target.searchParams.append(key, value);
  return NextResponse.redirect(target);
}

/**
 * Routes that are open to everybody, with or without a session. Everything
 * else (the workspace surfaces) requires a verified account and is guarded by
 * the auth gate below.
 */
const PUBLIC_ROUTES = new Set([
  "/",
  "/login",
  "/auth/reset",
  "/about",
  "/pricing",
  "/claim",
]);

function isPublicAnswerPage(pathname: string): boolean {
  return pathname === "/h" || pathname.startsWith("/h/") || pathname.startsWith("/j/");
}

/**
 * Page surfaces that require a verified account. An unauthenticated request
 * is redirected to /login with the original path in `?next=`, so the visitor
 * arrives back exactly where they intended after signing in.
 */
const PROTECTED_PAGES = new Set([
  "/chat",
  "/onboarding",
  "/welcome",
  "/account",
  "/settings",
  "/projects",
  "/artifacts",
  "/image",
  "/code",
  "/vision",
  "/voice",
  "/library",
]);

/**
 * Expensive AI API surfaces that are account-only (guests may only chat).
 * An unauthenticated request is refused with 401 at the edge, before any
 * provider or credit work happens. Other API routes (/api/chat for guests,
 * /api/quota, /api/health, /api/auth/*, …) pass through and self-enforce
 * in their route handlers.
 */
const PROTECTED_API_ROUTES = new Set(["/api/image", "/api/code", "/api/voice", "/api/vision"]);

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

export function middleware(req: NextRequest) {
  const callbackRedirect = redirectCallbackToLogin(req);
  if (callbackRedirect) return callbackRedirect;

  const { pathname } = req.nextUrl;

  // Static assets and edge-cached public files never touch the auth gate.
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

  const session = req.cookies.get("anvik_session")?.value;

  // --- Public pages: set the guest device cookie and pass through. --------
  if (PUBLIC_ROUTES.has(pathname) || isPublicAnswerPage(pathname)) {
    return setDeviceCookie(NextResponse.next(), req.cookies.get("anvik_dev")?.value);
  }

  // --- API routes: the expensive surfaces are refused at the edge. ---------
  if (pathname.startsWith("/api/")) {
    if (PROTECTED_API_ROUTES.has(pathname) && !session) {
      return NextResponse.json(
        { error: "Sign in to use this surface.", code: "unauthenticated" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.next();
  }

  // --- Protected pages: redirect unauthenticated visitors to /login. ------
  if (PROTECTED_PAGES.has(pathname)) {
    if (!session) {
      const target = req.nextUrl.clone();
      target.pathname = AUTH_CALLBACK_PATH;
      target.search = "";
      target.searchParams.set("next", pathname);
      const res = NextResponse.redirect(target);
      return setDeviceCookie(res, req.cookies.get("anvik_dev")?.value);
    }
    return setDeviceCookie(NextResponse.next(), req.cookies.get("anvik_dev")?.value);
  }

  // Anything not listed above (e.g. /api/* already handled, future pages)
  // passes through so new routes aren't accidentally locked out.
  return setDeviceCookie(NextResponse.next(), req.cookies.get("anvik_dev")?.value);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon).*)"],
};
