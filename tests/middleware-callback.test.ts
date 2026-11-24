import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

const ORIGIN = "https://anvik-ai-v2.vercel.app";

function loc(res: Response): string | null {
  return res.headers.get("location");
}

test("an OAuth code landing on the root is forwarded to /login", () => {
  // This is what Supabase does when redirect_to is not allow-listed: it falls
  // back to the Site URL. Without this rescue the code is never exchanged.
  const res = middleware(new NextRequest(`${ORIGIN}/?code=abc123&state=s1`));
  const location = loc(res as unknown as Response);
  assert.ok(location, "must redirect rather than render");
  const url = new URL(location!);
  assert.equal(url.pathname, "/login");
  assert.equal(url.searchParams.get("code"), "abc123", "the code is carried across intact");
  assert.equal(url.searchParams.get("state"), "s1");
});

test("a code landing on any other page is forwarded too", () => {
  const res = middleware(new NextRequest(`${ORIGIN}/account?code=abc123`));
  const url = new URL(loc(res as unknown as Response)!);
  assert.equal(url.pathname, "/login");
  assert.equal(url.searchParams.get("code"), "abc123");
});

test("the real callback page is left alone", () => {
  const res = middleware(new NextRequest(`${ORIGIN}/login?code=abc123`));
  assert.equal(loc(res as unknown as Response), null, "/login handles its own exchange");
});

test("requests without a code are untouched", () => {
  for (const path of ["/", "/chat", "/login", "/account"]) {
    const res = middleware(new NextRequest(`${ORIGIN}${path}`));
    assert.equal(loc(res as unknown as Response), null, `${path} must not redirect`);
  }
});

test("API routes are never redirected", () => {
  const res = middleware(new NextRequest(`${ORIGIN}/api/chat?code=abc123`));
  assert.equal(loc(res as unknown as Response), null, "redirecting an API call would corrupt it");
});

test("the device-id cookie is still issued", () => {
  const res = middleware(new NextRequest(`${ORIGIN}/chat`)) as unknown as Response;
  assert.ok(res.headers.get("set-cookie")?.includes("anvik_dev="), "device identity is preserved");
});
