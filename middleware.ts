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

export function middleware(req: NextRequest) {
  const existing = req.cookies.get("anvik_dev")?.value;
  if (existing) return NextResponse.next();

  const res = NextResponse.next();
  res.cookies.set("anvik_dev", deviceId(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon).*)"],
};
