import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

const ORIGIN = "https://anvik-ai-v2.vercel.app";

function location(res: Response): string | null {
  return res.headers.get("location");
}

test("workspace pages are accessible without a signed-in account", () => {
  for (const path of ["/", "/login", "/chat", "/account", "/settings", "/projects", "/code", "/image"]) {
    const response = middleware(new NextRequest(`${ORIGIN}${path}`)) as unknown as Response;
    assert.equal(location(response), null, `${path} must not send visitors to a sign-in screen`);
    assert.ok(response.headers.get("set-cookie")?.includes("anvik_dev="), "device fallback cookie is issued");
  }
});

test("legacy OAuth callback URLs are not intercepted by guest middleware", () => {
  for (const path of ["/?code=abc123&state=s1", "/account?code=abc123", "/login?code=abc123"]) {
    const response = middleware(new NextRequest(`${ORIGIN}${path}`)) as unknown as Response;
    assert.equal(location(response), null, "guest routing must not rewrite application URLs");
  }
});

test("API routes are never redirected", () => {
  const response = middleware(new NextRequest(`${ORIGIN}/api/chat?code=abc123`)) as unknown as Response;
  assert.equal(location(response), null);
});

test("metered tool APIs wait for the anonymous session cookie", () => {
  for (const path of ["/api/image", "/api/code", "/api/voice", "/api/vision"]) {
    const response = middleware(new NextRequest(`${ORIGIN}${path}`, { method: "POST" })) as unknown as Response;
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, "guest_session_initializing");
  }
});

test("metered tool APIs pass middleware once the guest cookie exists", () => {
  for (const path of ["/api/image", "/api/code", "/api/voice", "/api/vision"]) {
    const response = middleware(new NextRequest(`${ORIGIN}${path}`, {
      method: "POST",
      headers: { cookie: "anvik_session=verified-guest-session" },
    })) as unknown as Response;
    assert.equal(response.status, 200);
    assert.equal(location(response), null);
  }
});
