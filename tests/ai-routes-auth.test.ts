import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as chatRoute from "../app/api/chat/route";
import * as askRoute from "../app/api/ask/route";
import * as codeRoute from "../app/api/code/route";
import * as voiceRoute from "../app/api/voice/route";
import * as visionRoute from "../app/api/vision/route";
import * as imageRoute from "../app/api/image/route";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const generationRoutes = [
  "app/api/chat/route.ts",
  "app/api/ask/route.ts",
  "app/api/code/route.ts",
  "app/api/voice/route.ts",
  "app/api/vision/route.ts",
  "app/api/image/route.ts",
];

test("every generation route requires a verified Supabase user", () => {
  for (const routePath of generationRoutes) {
    const source = readFileSync(join(root, routePath), "utf8");
    assert.ok(source.includes("requireUser"), routePath + " must import and invoke the verified session guard");
    assert.ok(source.includes('from "@/lib/session"'), routePath + " must use the shared session module");
    assert.ok(!source.includes("getVerifiedUserIfPresent"), routePath + " must not treat guests as optional users");
  }
});

test("chat authenticates before its limiter and credit reservation", () => {
  const source = readFileSync(join(root, "app/api/chat/route.ts"), "utf8");
  const guard = source.indexOf("const auth = await requireUser(request)");
  const limiter = source.indexOf("allowDistributed(");
  const reserve = source.indexOf("reserveCredit(");
  assert.ok(guard >= 0 && limiter > guard, "authentication must precede rate limiting");
  assert.ok(reserve < 0 || reserve > guard, "authentication must precede credit reservation");
});

test("all six AI generation endpoints reject a guest before provider work", async () => {
  const headers = {
    "Content-Type": "application/json",
    "x-google-generative-ai-api-key": "AQ.test-key-aq-prefix-acceptance-1234567890",
  };
  const makeRequest = (url: string, body: unknown = {}) => new Request("http://localhost" + url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const calls = await Promise.all([
    chatRoute.POST(makeRequest("/api/chat", { messages: [{ role: "user", content: "guest test" }] })),
    askRoute.POST(makeRequest("/api/ask")),
    codeRoute.POST(makeRequest("/api/code")),
    voiceRoute.POST(makeRequest("/api/voice")),
    visionRoute.POST(makeRequest("/api/vision")),
    imageRoute.POST(makeRequest("/api/image")),
  ]);
  for (const response of calls) {
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.code, "unauthenticated");
  }
});
