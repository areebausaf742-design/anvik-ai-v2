import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(join(root, "app/api/chat/route.ts"), "utf8");
const workspace = readFileSync(join(root, "components/anvik/chat-workspace.tsx"), "utf8");

const ANSWER_SOURCES = [
  "localAnswer",
  "corpusAnswer",
  "corpusEntry",
  "memoryGet",
  "cacheKey",
  "prepareHistory",
  "findReplay",
  "saveAnswer",
  "demoReply",
  "streamCorpus",
  "fallbackAnswer",
];

test("the chat route has no shortcut that can answer without the model", () => {
  for (const name of ANSWER_SOURCES) {
    assert.ok(!route.includes(name), `${name} must not appear in app/api/chat/route.ts`);
  }
});

test("the chat route never imports the corpus", () => {
  assert.ok(!/from\s+["']@\/lib\/corpus/.test(route), "the corpus must not be reachable from chat");
  const imports = [...route.matchAll(/import\s+\{([^}]+)\}\s+from\s+["']@\/lib\/credit["']/g)];
  for (const [, names] of imports) {
    const allowed = ["CHAT_MAX_TOKENS", "CODE_MAX_TOKENS", "MAX_TEMPERATURE", "PAID_MAX_TOKENS"];
    for (const name of names.split(",").map((n) => n.trim()).filter(Boolean)) {
      assert.ok(allowed.includes(name), `${name} from lib/credit must not be used in chat`);
    }
  }
});

test("the chat route forwards full conversation turns directly to Gemini SSE streaming", () => {
  assert.ok(route.includes("openGeminiStreamWithFallback"), "chat route must call openGeminiStreamWithFallback");
  assert.ok(route.includes("safeMessages.map"), "all safeMessages must be forwarded to Gemini");
  assert.ok(route.includes('"X-ANVIK-LABEL": "ANVIK"'), "response must carry the ANVIK label header");
});

test("the client cannot replay an answer from memory", () => {
  assert.ok(!workspace.includes("findReplay"), "no replay path in the composer");
  assert.ok(!workspace.includes("saveAnswer"), "nothing is written to an answer cache");
  assert.ok(!workspace.includes("localAnswer"), "no local answer path");
});

test("no credit or unlimited wording survives in the interface", () => {
  for (const phrase of [
    "0 credits",
    "From memory",
    "reviewed answer set",
    "Unlimited with",
    "Saving credits",
    "Smart Mode ON",
  ]) {
    assert.ok(!workspace.includes(phrase), `"${phrase}" must be gone from the chat UI`);
  }
  assert.ok(workspace.includes("ANVIK 1.0"), "the interface must use ANVIK model branding");
  assert.ok(!workspace.includes("From Gemini"), "the interface must not expose provider branding");
});

test("chat sends optimistic UI updates before the network request", () => {
  const start = workspace.indexOf("async function sendMessage");
  const end = workspace.indexOf("function submit(", start);
  assert.ok(start >= 0 && end > start, "sendMessage implementation must be present");
  const send = workspace.slice(start, end);
  const optimistic = send.indexOf("addMessage(conversationId, userMessage)");
  const request = send.indexOf('fetch("/api/chat"');
  const quotaPreflight = send.indexOf('fetch("/api/quota"');
  assert.ok(optimistic >= 0 && request > optimistic, "the user message must render before the chat network request");
  assert.ok(quotaPreflight < 0 || quotaPreflight > request, "quota refresh must not delay optimistic rendering");
});

test("chat composer uses the new placeholder and premium accessible controls", () => {
  assert.ok(workspace.includes('placeholder="Ask ANVIK a question..."'));
  assert.ok(workspace.includes("<ModelSelector value={mode} onChange={setMode} />"));
  assert.ok(workspace.includes("<DeepSearchToggle value={searchMode} onChange={setSearchMode} />"));
  assert.ok(workspace.includes("search: searchMode,"));
  assert.ok(workspace.includes('document.addEventListener("pointerdown", closeOnOutsidePointer)'));
  assert.ok(!workspace.includes("WebSearchMenu"));
});
