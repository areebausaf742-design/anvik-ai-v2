import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldAutoSearch,
  normalizeSearchMode,
  normalizeSources,
  normalizeQueries,
  domainOf,
} from "../lib/search";
import { openGeminiStreamWithFallback, type SearchMetaCapture } from "../lib/gemini";

/* ------------------------------------------------------------------ */
/* Auto mode — the deterministic classifier                            */
/* ------------------------------------------------------------------ */

test("Auto searches when the question needs up-to-date information", () => {
  const searches = [
    "What is the latest news about AI?",
    "Weather today in Lucknow?",
    "Who won the match last week?",
    "What are the current trending topics on X?",
    "What is the price of gold today?",
    "News about the new iPhone release",
    "Who won the FIFA World Cup 2026?",
    "Tell me the latest update on the stock market",
    "What happened at yesterday's auction?",
  ];
  for (const query of searches) {
    assert.equal(shouldAutoSearch(query), true, `'${query}' should search`);
  }
});

test("Auto does not search for static, code or math questions", () => {
  const statics = [
    "Write Python code for a calculator",
    "Explain Java OOP with example",
    "Solve a quadratic equation step by step",
    "Make a study plan for Class 12",
    "Solve Physics numerical step by step",
    "What is photosynthesis?",
    "What is the speed of light?",
    "Write an email to my teacher",
    "Explain quantum computing briefly",
  ];
  for (const query of statics) {
    assert.equal(shouldAutoSearch(query), false, `'${query}' should not search`);
  }
});

test("normalizeSearchMode honours the three modes and coerces the rest to auto", () => {
  assert.equal(normalizeSearchMode("on"), "on");
  assert.equal(normalizeSearchMode("OFF"), "off");
  assert.equal(normalizeSearchMode("auto"), "auto");
  assert.equal(normalizeSearchMode("garbage"), "auto");
  assert.equal(normalizeSearchMode(undefined), "auto");
  assert.equal(normalizeSearchMode(42), "auto");
});

/* ------------------------------------------------------------------ */
/* Source normalization                                                */
/* ------------------------------------------------------------------ */

test("normalizeSources dedupes, cleans and skips garbage", () => {
  const sources = normalizeSources([
    { web: { uri: "https://www.example.com/news/article", title: "Big Story" } },
    { web: { uri: "https://example.com/news/article", title: "Dup" } },
    { web: { uri: "not a url" } },
    { web: { title: "No URI" } },
    "junk",
    { web: { uri: "https://news.example.org/other" } },
  ]);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].uri, "https://www.example.com/news/article");
  assert.equal(sources[0].title, "Big Story");
  assert.equal(sources[0].domain, "example.com");
  assert.equal(sources[1].domain, "news.example.org");
  // no title → title falls back to the domain, never the raw URI
  assert.equal(sources[1].title, "news.example.org");
});

test("normalizeQueries dedupes, drops blanks and caps the list", () => {
  const queries = normalizeQueries([
    "AI news 2026",
    "ai news 2026",
    "  ",
    42,
    "weather lucknow",
    "q2", "q3", "q4", "q5", "q6", "q7",
  ]);
  assert.deepEqual(queries, ["AI news 2026", "weather lucknow", "q2", "q3", "q4", "q5"]);
});

test("domainOf strips www and falls back gracefully", () => {
  assert.equal(domainOf("https://www.example.com/path"), "example.com");
  assert.equal(domainOf("https://blog.example.org/a"), "blog.example.org");
  assert.equal(domainOf("not-a-url"), "not-a-url");
});

/* ------------------------------------------------------------------ */
/* Grounded streaming — sources come from the wire, never from a guess */
/* ------------------------------------------------------------------ */

const VALID_TEST_KEY = "AIzaSyTestKey1234567890123456789012345";

function groundedStream(chunks: string[], groundingMetadata?: unknown): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        const frame = JSON.stringify({
          candidates: [{ content: { parts: [{ text: chunk }] } }],
        });
        controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
      }
      if (groundingMetadata) {
        const frame = JSON.stringify({
          candidates: [{
            content: { parts: [{ text: "" }] },
            groundingMetadata,
          }],
        });
        controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

test("googleSearch is sent to Gemini and grounding metadata is captured", async () => {
  let callBody: Record<string, unknown> | null = null;
  const capture: SearchMetaCapture = { queries: [], sources: [], sawGrounding: false };

  const result = await openGeminiStreamWithFallback({
    apiKey: VALID_TEST_KEY,
    systemInstruction: "Answer directly.",
    contents: [{ role: "user", parts: [{ text: "latest news" }] }],
    googleSearch: true,
    searchMetaCapture: capture,
    fetchImpl: async (_input, init) => {
      callBody = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
      return new Response(
        groundedStream(
          ["Here is ", "the news."],
          {
            webSearchQueries: ["latest AI news", "ai news today"],
            groundingChunks: [
              { web: { uri: "https://example.com/story", title: "Story" } },
              { web: { uri: "https://www.other.org/article", title: "Article" } },
            ],
          },
        ),
        { status: 200 },
      );
    },
  });

  assert.equal(result.ok, true);
  assert.notEqual(callBody, null);
  assert.deepEqual((callBody as unknown as Record<string, unknown>).tools, [{ googleSearch: {} }]);
  if (result.ok) {
    const text = await new Response(result.stream).text();
    assert.equal(text, "Here is the news.");
  }
  assert.deepEqual(capture.queries, ["latest AI news", "ai news today"]);
  assert.equal(capture.sources.length, 2);
  const firstChunk = capture.sources[0] as { web: { uri: string } };
  assert.equal(firstChunk.web.uri, "https://example.com/story");
});

test("without googleSearch, the tools field is never sent", async () => {
  let body: string | null = null;
  const result = await openGeminiStreamWithFallback({
    apiKey: VALID_TEST_KEY,
    systemInstruction: "Answer directly.",
    contents: [{ role: "user", parts: [{ text: "hello" }] }],
    fetchImpl: async (_input, init) => {
      body = String((init as RequestInit).body);
      return new Response(groundedStream(["ok"]), { status: 200 });
    },
  });

  assert.equal(result.ok, true);
  assert.ok(body);
  assert.equal((JSON.parse(body as string) as Record<string, unknown>).tools, undefined);
});
