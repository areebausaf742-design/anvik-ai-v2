/**
 * Live proof that every answer comes from Gemini.
 *
 *   npm run verify:chat                       # uses GOOGLE_GENERATIVE_AI_API_KEY
 *   npm run verify:chat -- --key AIza...      # or an explicit key
 *   npm run verify:chat -- --url https://…    # against a deployment
 *
 * The five prompts from the brief are sent to a running /api/chat and each
 * answer is checked for three things:
 *   1. the response header says the source is gemini (never corpus/local/cache)
 *   2. the answer is not corpus text
 *   3. the answer stays on the topic of the question
 *
 * A missing key is not a pass: the script prints the honest 401 and exits 1,
 * because "no key" cannot demonstrate that Gemini answers.
 */

const PROMPTS: { prompt: string; topic: RegExp; label: string }[] = [
  { prompt: "hii", topic: /hello|hi\b|hey|namaste|kaise|how can|what|help|madad|नमस्ते|स्वागत/i, label: "greeting" },
  { prompt: "what is car?", topic: /car|vehicle|wheel|engine|drive|गाड़ी|वाहन/i, label: "car" },
  { prompt: "what is AI?", topic: /\bAI\b|artificial intelligence|machine learning|model|neural|algorithm/i, label: "ai" },
  { prompt: "write python code for calculator", topic: /python|def |print\(|calculator|operator|eval|input\(/i, label: "calculator code" },
  { prompt: "what is photosynthesis?", topic: /photosynthes|plant|chlorophyll|sunlight|glucose|carbon dioxide|पौध|प्रकाश/i, label: "photosynthesis" },
];

/** Fails if an answer contains a long verbatim run from the reviewed corpus. */
const CORPUS_FINGERPRINTS = [
  "A credit score improves through three habits",
  "Most stalled PM-KISAN instalments stop for two reasons",
  "घबराइए मत — ज़्यादातर रुकी किस्तें",
  "Credit score teen kaamon se badhta hai",
];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const base = arg("url") ?? "http://127.0.0.1:3000";
  const key = arg("key") ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "";

  if (!key.trim()) {
    console.error("No Gemini key. Every answer must come from Gemini, so there is nothing to verify.");
    console.error("Set GOOGLE_GENERATIVE_AI_API_KEY or pass --key.");
    process.exit(1);
  }

  console.log(`POST ${base}/api/chat — ${PROMPTS.length} prompts, model gemini-2.0-flash\n`);

  let failures = 0;
  for (const item of PROMPTS) {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-google-generative-ai-api-key": key,
        "x-anvik-device": "verify-chat",
      },
      body: JSON.stringify({ messages: [{ role: "user", content: item.prompt }], mode: "smart" }),
    });

    const source = response.headers.get("x-anvik-source") ?? "(none)";
    const raw = await response.text();
    const body = raw.split("\u2063ANVIK_CHECK:")[0].trim();

    const problems: string[] = [];
    if (!response.ok) problems.push(`HTTP ${response.status}: ${raw.slice(0, 120)}`);
    if (response.ok && source !== "gemini") problems.push(`source was "${source}"`);
    if (CORPUS_FINGERPRINTS.some((line) => body.includes(line))) problems.push("answer is corpus text");
    if (response.ok && body && !item.topic.test(body)) problems.push("answer is off-topic");

    console.log(`\n── ${item.label}: ${JSON.stringify(item.prompt)}`);
    console.log(`   source: ${source}   status: ${response.status}`);
    console.log(`   ${body.replace(/\s+/g, " ").slice(0, 220)}${body.length > 220 ? "…" : ""}`);
    if (problems.length) {
      failures += 1;
      for (const problem of problems) console.log(`   ✗ ${problem}`);
    } else {
      console.log("   ✓ from Gemini, on topic, not corpus text");
    }
  }

  console.log(`\n${PROMPTS.length - failures}/${PROMPTS.length} passed`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
