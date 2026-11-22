import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

const VALID_AQ_KEY = "AQ.test-key-aq-prefix-acceptance-1234567890";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vercel-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200) + 10}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("a complete streamed response delivers every token before the done frame", async () => {
  const { POST } = await import("../app/api/chat/route");

  // A long, table-like answer streamed as many tiny token frames.
  const tokens = [
    "Intro ", "| Name | Score |\n", "| --- | --- |\n",
    "| Alpha | 10 |\n", "| Beta | 9 |\n", "| Gamma | 8 |\n", "\nTrailing note.",
  ];
  mock.method(globalThis, "fetch", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const t of tokens) {
          const frame = JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] });
          controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  });

  const response = await POST(
    makeRequest(
      { messages: [{ role: "user", content: "compare alpha beta gamma" }] },
      { "x-google-generative-ai-api-key": VALID_AQ_KEY, accept: "text/event-stream" },
    ),
  );
  assert.equal(response.status, 200);

  const text = await response.text();
  const frames = text.split("\n\n").map((f) => f.trim()).filter(Boolean);
  const toks: string[] = [];
  let doneFound = false;
  for (const frame of frames) {
    if (!frame.startsWith("data:")) continue;
    const payload = JSON.parse(frame.slice(5).trim()) as { t?: string; s?: string };
    if (payload.t === "tok" && typeof payload.s === "string") toks.push(payload.s);
    if (payload.t === "done") doneFound = true;
  }
  const answer = toks.join("");
  assert.ok(doneFound, "done frame must arrive");
  // Every token is present — the stream is never silently truncated.
  assert.deepEqual(tokens, toks);
  assert.equal(answer, "Intro | Name | Score |\n| --- | --- |\n| Alpha | 10 |\n| Beta | 9 |\n| Gamma | 8 |\n\nTrailing note.");
  assert.match(answer, /\| Gamma \| 8 \|/);
});
