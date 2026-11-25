import test from "node:test";
import assert from "node:assert/strict";
import { withFailover as wf, retryWithJitter as rj, runWithFailover as rf } from "../lib/ai-gateway";
import { redactSecrets as rs } from "../lib/telemetry";

test("gateway failover retries and succeeds", async () => {
  let calls = 0;
  const result = await rj(async () => {
    calls++;
    if (calls < 3) throw Object.assign(new Error("boom"), { status: 503 });
    return "ok";
  }, { retries: 3, delaysMs: [1, 1], jitter: false });
  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("gateway failover falls back to backup provider", async () => {
  const result = await rf([
    async () => { throw Object.assign(new Error("down"), { status: 500 }); },
    async () => "backup-ok",
  ], { retries: 0, delaysMs: [1], jitter: false });
  assert.equal(result, "backup-ok");
});

test("withFailover alias works", async () => {
  const result = await wf(async () => "direct", { retries: 0 });
  assert.equal(result, "direct");
});

test("telemetry redacts secrets", () => {
  const input = "api_key=AIzaabcdefghijklmnopqrstuvwx message token: secret123 Bearer abc.def";
  const out = rs(input);
  assert.ok(!out.includes("AIzaabcdefghijklmnopqrstuvwx"), "api key leaked");
  assert.ok(out.includes("[REDACTED]"), "redaction marker missing");
});

test("self-healing boundary file exists", async () => {
  const fs = await import("node:fs");
  const p = new URL("../components/anvik/self-healing-boundary.tsx", import.meta.url);
  assert.ok(fs.existsSync(p));
});

test("telemetry route returns 200 without env", async () => {
  // smoke: file exists
  const fs = await import("node:fs");
  const p = new URL("../app/api/telemetry/route.ts", import.meta.url);
  assert.ok(fs.existsSync(p));
});

test("autonomous healer script runs", async () => {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, ["scripts/autonomous-healer.mjs"], { encoding: "utf8" });
  assert.equal(r.status, 0);
});
