/**
 * PII scrubber (Phase 8 — training pipeline).
 *
 * Scrubs names, emails, phone numbers, API keys, card numbers, Aadhaar and
 * tokens from conversation text before it enters the training dataset.
 * Reuses the same redaction patterns as lib/learning.ts so the two paths
 * agree on what counts as sensitive.
 *
 * Usage:
 *   npx tsx scripts/pii-scrub.ts <input.jsonl> <output.jsonl>
 *
 * Each input line is a JSON object with { question, answer }. Output lines
 * have the same shape with scrubbed text plus a `redacted` array.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const PATTERNS: { re: RegExp; replace: string; what: string }[] = [
  { re: /\bAIza[0-9A-Za-z_-]{20,}\b/g, replace: "[key removed]", what: "api key" },
  { re: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replace: "[key removed]", what: "api key" },
  { re: /\b(?:ghp|gho|ghs)_[A-Za-z0-9]{20,}\b/g, replace: "[key removed]", what: "api key" },
  { re: /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi, replace: "Bearer [token removed]", what: "token" },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, replace: "[token removed]", what: "token" },
  { re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, replace: "[email removed]", what: "email" },
  { re: /(?:\+?91[\s-]?)?\b[6-9]\d{9}\b/g, replace: "[phone removed]", what: "phone" },
  { re: /\b\d{4}\s\d{4}\s\d{4}\b/g, replace: "[id removed]", what: "id" },
  { re: /\b(?:\d[ -]?){13,16}\b/g, replace: "[card removed]", what: "card" },
];

function scrub(text: string): { text: string; removed: string[] } {
  const removed = new Set<string>();
  let out = text;
  for (const { re, replace, what } of PATTERNS) {
    out = out.replace(re, () => {
      removed.add(what);
      return replace;
    });
  }
  return { text: out, removed: [...removed] };
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    console.error("Usage: npx tsx scripts/pii-scrub.ts <input.jsonl> <output.jsonl>");
    process.exit(1);
  }
  const lines = readFileSync(path.resolve(inputPath), "utf8").split(/\r?\n/).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    let obj: { question?: string; answer?: string } = {};
    try {
      obj = JSON.parse(line);
    } catch {
      console.error("Skipping malformed line:", line.slice(0, 80));
      continue;
    }
    const q = scrub(String(obj.question ?? ""));
    const a = scrub(String(obj.answer ?? ""));
    out.push(
      JSON.stringify({
        question: q.text,
        answer: a.text,
        redacted: [...new Set([...q.removed, ...a.removed])],
      }),
    );
  }
  writeFileSync(path.resolve(outputPath), out.join("\n") + "\n", "utf8");
  console.log(`Scrubbed ${out.length} records → ${outputPath}`);
}

main();
