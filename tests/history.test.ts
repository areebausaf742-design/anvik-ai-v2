import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MESSAGE_CHARS,
  sanitizeTurns,
  buildGeminiContents,
} from "../lib/history";

function partText(part: { text?: string; inlineData?: unknown }): string {
  return part.text ?? "";
}

test("a plain conversation maps assistant → model and ends with the user", () => {
  const result = sanitizeTurns([
    { role: "user", content: "what is a car?" },
    { role: "assistant", content: "A car is a vehicle." },
    { role: "user", content: "tell me more" },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const contents = buildGeminiContents(result.turns);
  assert.deepEqual(
    contents.map((c) => c.role),
    ["user", "model", "user"],
  );
  assert.equal(partText(contents[2].parts[0]), "tell me more");
});

test("trailing assistant turns are dropped — the model must never answer an old message", () => {
  const result = sanitizeTurns([
    { role: "user", content: "what is ai?" },
    { role: "assistant", content: "AI is software." },
    { role: "assistant", content: "Duplicate placeholder." },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const contents = buildGeminiContents(result.turns);
  assert.equal(contents.length, 1);
  assert.equal(contents[0].role, "user");
});

test("an empty user message is rejected", () => {
  const result = sanitizeTurns([{ role: "user", content: "   " }]);
  assert.equal(result.ok, false);
});

test("over-long messages are rejected, nothing is silently truncated", () => {
  const result = sanitizeTurns([{ role: "user", content: "x".repeat(MAX_MESSAGE_CHARS + 1) }]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, new RegExp(`${MAX_MESSAGE_CHARS}`));
});

test("unknown roles and non-object entries are rejected", () => {
  assert.equal(sanitizeTurns([{ role: "system", content: "p" }]).ok, false);
  assert.equal(sanitizeTurns(["not an object"]).ok, false);
  assert.equal(sanitizeTurns("not an array").ok, false);
});

test("duplicate consecutive user turns are merged into one user turn — never two", () => {
  const result = sanitizeTurns([
    { role: "user", content: "hello" },
    { role: "user", content: "hello again" },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const contents = buildGeminiContents(result.turns);
  assert.equal(contents.length, 1);
  assert.equal(contents[0].role, "user");
  assert.match(partText(contents[0].parts[0]), /hello/);
  assert.match(partText(contents[0].parts[0]), /hello again/);
});

test("history is capped by size; the oldest turns are dropped, newest kept", () => {
  const turns = [] as { role: "user" | "assistant"; content: string }[];
  for (let i = 0; i < 30; i++) {
    turns.push({ role: "user", content: `message ${i} ${"x".repeat(3000)}` });
  }
  turns.push({ role: "user", content: "final question" });
  const result = sanitizeTurns(turns);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const contents = buildGeminiContents(result.turns);
  assert.equal(contents[contents.length - 1].role, "user");
  // never larger than the total-size cap
  const total = contents.reduce((sum, c) => sum + partText(c.parts[0]).length, 0);
  assert.ok(total <= 34_000, `total size ${total} should be capped`);
  assert.match(partText(contents[contents.length - 1].parts[0]), /final question/);
});

test("an assistant-only conversation yields no contents (caller must 400)", () => {
  const result = sanitizeTurns([{ role: "assistant", content: "orphan reply" }]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(buildGeminiContents(result.turns), []);
});
