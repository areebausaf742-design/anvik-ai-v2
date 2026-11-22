/**
 * lib/observability — the single privacy-conscious structured-log contract.
 * Every event is one single-line JSON object; nothing user-content-like ever
 * appears in the payload.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

import { logRouteEvent } from "../lib/observability";

test("logs one single-line JSON event with only non-content fields", () => {
  const lines: string[] = [];
  mock.method(console, "log", (line: unknown) => {
    lines.push(String(line));
  });
  logRouteEvent({
    route: "chat",
    outcome: "success",
    status: 200,
    latencyMs: 12.3,
    model: "gemini-2.5-flash",
  });
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(entry.service, "anvik-ai-v2");
  assert.equal(entry.route, "chat");
  assert.equal(entry.outcome, "success");
  assert.equal(entry.status, 200);
  assert.equal(entry.latencyMs, 12);
  assert.equal(entry.model, "gemini-2.5-flash");
  assert.equal(typeof entry.ts, "string");
  mock.restoreAll();
});

test("never carries content fields — no prompts, keys, messages or names", () => {
  const lines: string[] = [];
  mock.method(console, "log", (line: unknown) => {
    lines.push(String(line));
  });
  logRouteEvent({
    route: "chat",
    outcome: "rate_limited",
    status: 429,
    latencyMs: 0,
    rateLimitSource: "memory",
    errorCode: "rate_limit",
  });
  const entry = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(entry.rateLimitSource, "memory");
  assert.equal(entry.errorCode, "rate_limit");
  const keys = Object.keys(entry).sort();
  for (const forbidden of ["prompt", "message", "content", "apiKey", "messages", "user", "email", "name"]) {
    assert.notEqual(keys.includes(forbidden), true, `payload must never contain "${forbidden}"`);
  }
  mock.restoreAll();
});

test("a garbage event never throws", () => {
  mock.method(console, "log", () => undefined);
  const garbage = { route: undefined, outcome: undefined, status: undefined, latencyMs: NaN };
  assert.doesNotThrow(() => logRouteEvent(garbage as never));
  mock.restoreAll();
});
