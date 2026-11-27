// k6 load test for the ANVIK chat path (Phase 9 — final polish).
//
// Run:  k6 run scripts/load-test.k6.js
// Env:  BASE_URL (default http://localhost:3000), API_KEY (optional Gemini key)
//
// Reports p50/p95/p99 latency, throughput and error rate. Publish the
// resulting numbers in REPORT.md.
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const API_KEY = __ENV.API_KEY || "";

export const options = {
  stages: [
    { duration: "30s", target: 10 },   // ramp up
    { duration: "60s", target: 50 },   // sustained load
    { duration: "30s", target: 100 },  // peak
    { duration: "30s", target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000", "p(99)<4000"],
  },
};

const ttft = new Trend("time_to_first_token_ms");
const errors = new Rate("errors");

export default function () {
  const payload = JSON.stringify({
    messages: [{ role: "user", content: "Explain quantum computing like I'm twelve" }],
    mode: "fast",
    temperature: 0.6,
  });
  const headers = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (API_KEY) headers["x-google-generative-ai-api-key"] = API_KEY;

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/chat`, payload, { headers });

  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
    "body non-empty": (r) => (r.body || "").length > 0,
  });
  if (!ok) errors.add(1);
  else {
    // time to first byte as a proxy for TTFT
    ttft.add(res.timings.waiting);
  }

  sleep(1);
}
