import test from "node:test";
import assert from "node:assert/strict";
import {
  containsSecret,
  learningStats,
  memoryInstruction,
  normalizeQuestion,
  redact,
  topicsOf,
  type Feedback,
  type Learning,
} from "../lib/learning";

test("API keys never survive redaction", () => {
  const { text, removed } = redact("my key is AIzaSyD-abcdefghijklmnopqrstuvwxyz123456 ok?");
  assert.ok(!text.includes("AIza"));
  assert.ok(text.includes("[key removed]"));
  assert.deepEqual(removed, ["api key"]);
});

test("passwords written as sentences or as key: value are stripped", () => {
  assert.ok(!redact("password: hunter2 and the username is ravi").text.includes("hunter2"));
  assert.ok(!redact("my password is abc123").text.includes("abc123"));
  assert.ok(redact("my password is abc123 and I am ravi").text.includes("ravi"), "a name is not a secret");
});

test("phone, Aadhaar and card numbers are removed", () => {
  const { text, removed } = redact("call me on 9876543210 or +91 91234 56789");
  assert.ok(!text.includes("9876543210"));
  assert.ok(text.includes("[phone removed]"));
  assert.ok(removed.includes("phone"));
  assert.ok(!redact("card 4111 1111 1111 1111 expiry 09/28").text.includes("4111"));
});

test("an ordinary question is not mangled", () => {
  const clean = "What is the speed of light and why does it matter?";
  assert.equal(redact(clean).text, clean);
  assert.equal(containsSecret(clean), false);
  assert.equal(containsSecret("my password is abc123"), true);
});

test("normalisation makes the same question comparable", () => {
  assert.equal(normalizeQuestion("What is the SPEED of light??"), normalizeQuestion("what is the speed of light"));
});

test("topics pick content words, not grammar", () => {
  const topics = topicsOf("What is the speed of light?");
  assert.ok(topics.includes("speed"));
  assert.ok(!topics.includes("what"));
  assert.ok(!topics.includes("is"));
});

test("memory instruction is one line, and only says what was set", () => {
  const instruction = memoryInstruction({ name: "Ravi", lang: "hi-Latn", style: "short", updatedAt: 1 });
  assert.match(instruction, /Ravi/);
  assert.match(instruction, /Hinglish/);
  assert.equal(instruction.split("\n").length, 1);
});

test("dashboard counts feedback and topics, with no replay counter", () => {
  const feedback: Feedback[] = [
    { id: "1", question: "what is the speed of light", answer: "a", verdict: "like", lang: "en", topic: "light", createdAt: 3 },
    { id: "2", question: "what is ai", answer: "b", verdict: "like", lang: "en", topic: "ai", createdAt: 2 },
    { id: "3", question: "what is the speed of light", answer: "c", verdict: "dislike", lang: "en", topic: "light", createdAt: 1 },
  ];
  const learning: Learning = {
    feedback,
    corrections: [
      { id: "4", question: "what is the speed of light", answer: "c", correction: "a fixed value", lang: "en", topic: "light", createdAt: 1 },
    ],
    updatedAt: 1,
  };
  const stats = learningStats(learning);
  assert.equal(stats.likes, 2);
  assert.equal(stats.dislikes, 1);
  assert.equal(stats.corrections, 1);
  assert.equal(stats.topTopics[0].topic, "light");
  assert.equal(stats.topTopics[0].count, 3);
  assert.equal(stats.bestReplies[0].at, 3, "most recent like first");
  assert.equal((stats as unknown as Record<string, unknown>).replays, undefined);
});

test("learning exposes no way to select an answer", async () => {
  const learning = (await import("../lib/learning")) as Record<string, unknown>;
  for (const name of ["findReplay", "saveAnswer", "readCacheEntry", "cacheCount"]) {
    assert.equal(learning[name], undefined, `${name} must not exist — it picked an answer instead of asking`);
  }
});
