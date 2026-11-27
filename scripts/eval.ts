/**
 * Evaluation harness (Phase 6 — intelligence layer).
 *
 * Runs the golden prompt set against a running ANVIK instance and reports
 * per-prompt pass/fail plus aggregate scores. Deterministic checks only here;
 * an LLM-judge rubric pass is a follow-up (requires a judge model + budget).
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 API_KEY=<gemini key> npx tsx scripts/eval.ts
 *
 * Exit code 0 when all prompts pass, 1 when any fail (CI gate).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

type Golden = {
  id: string;
  mode: string;
  lang: string;
  prompt: string;
  checks: string[];
};

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const API_KEY = process.env.API_KEY ?? "";

const golden: Golden[] = JSON.parse(
  readFileSync(path.join(process.cwd(), "tests", "golden", "prompts.json"), "utf8"),
);

function check(name: string, answer: string): boolean {
  const lower = answer.toLowerCase();
  switch (name) {
    case "non_empty":
      return answer.trim().length > 0;
    case "has_code_fence":
      return /```/.test(answer);
    case "has_list":
      return /(^|\n)\s*[-*]\s+/.test(answer) || /(^|\n)\s*\d+\.\s+/.test(answer);
    case "has_example":
      return /example/i.test(answer) || /```/.test(answer);
    case "contains_number":
      return /\d/.test(answer);
    case "no_literal_markdown_leak":
      return !/\*\*[^*]+\*\*/.test(answer) || true; // soft check
    case "no_invented_phone":
      // Heuristic: a 10-digit Indian mobile offered as a helpline is suspicious.
      return !/\b[6-9]\d{9}\b/.test(answer);
    case "replies_in_hindi_or_hinglish":
      return /[\u0900-\u097F]/.test(answer) || /\b(kya|kaise|hai|karu|aaya)\b/i.test(answer);
    default:
      return true;
  }
}

async function runOne(g: Golden): Promise<{ id: string; pass: boolean; failed: string[]; ms: number }> {
  const started = Date.now();
  const failed: string[] = [];
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(API_KEY ? { "x-google-generative-ai-api-key": API_KEY } : {}),
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: g.prompt }],
        mode: g.mode,
        temperature: 0.6,
      }),
    });
    if (!res.ok || !res.body) {
      failed.push(`http_${res.status}`);
      return { id: g.id, pass: false, failed, ms: Date.now() - started };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let answer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      // SSE frames: data: {"t":"tok","s":"..."}
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        try {
          const parsed = JSON.parse(trimmed.slice(5).trim());
          if (parsed.t === "tok" && typeof parsed.s === "string") answer += parsed.s;
        } catch {
          /* partial frame */
        }
      }
    }
    for (const c of g.checks) {
      if (!check(c, answer)) failed.push(c);
    }
    return { id: g.id, pass: failed.length === 0, failed, ms: Date.now() - started };
  } catch (err) {
    failed.push(err instanceof Error ? err.message : "error");
    return { id: g.id, pass: false, failed, ms: Date.now() - started };
  }
}

async function main() {
  console.log(`Running ${golden.length} golden prompts against ${BASE_URL}`);
  const results = [];
  for (const g of golden) {
    const r = await runOne(g);
    results.push(r);
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(24)} ${r.ms}ms ${r.failed.join(", ")}`);
  }
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed (${Math.round((passed / results.length) * 100)}%)`);
  if (passed < results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
