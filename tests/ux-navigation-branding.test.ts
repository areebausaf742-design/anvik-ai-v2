import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the chat sidebar navigates without a full page reload", () => {
  const source = readFileSync(
    new URL("../components/anvik/chat-workspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /import Link from "next\/link"/);
  assert.match(source, /<Link[\s\S]{0,200}href=\{item\.href\}/, "sidebar nav should use client-side Link navigation");
});

test("Code Lab has an accessible Back to Chat link and ANVIK branding", () => {
  const source = readFileSync(
    new URL("../components/anvik/creative-studio.tsx", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("function CodeLab()");
  const end = source.indexOf("function VoiceStudio()");
  const codeLab = source.slice(start, end);

  assert.ok(start >= 0 && end > start, "CodeLab component exists");
  assert.match(codeLab, /href="\/chat"/, "Code Lab needs a Back to Chat link");
  assert.match(codeLab, /Back to Chat/);
  assert.match(codeLab, /ANVIK · Coder/);
  assert.doesNotMatch(codeLab, /gemini-2\.0-flash/, "Code Lab must not show raw provider model ids");
  assert.doesNotMatch(codeLab, /modelUsed/, "Code Lab should not track a raw model label");
});

test("chat message footers use branded ANVIK labels", () => {
  const source = readFileSync(
    new URL("../components/anvik/chat-workspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /brandedModelLabel\(message\.model, mode\)/);
  assert.doesNotMatch(source, /message\.model \|\| "ANVIK"/);
});

test("brandedModelLabel never returns a raw provider model id", async () => {
  const { brandedModelLabel } = await import("../lib/prompts");
  assert.equal(brandedModelLabel("gemini-2.5-flash", "smart"), "ANVIK · Smart");
  assert.equal(brandedModelLabel("ANVIK 1.0", "coder"), "ANVIK 1.0");
  assert.equal(brandedModelLabel(undefined, "fast"), "ANVIK · Fast");
});

test("SessionProvider caches the last verified account and revalidates in the background", () => {
  const source = readFileSync(
    new URL("../components/anvik/session-provider.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /ACCOUNT_CACHE_KEY/);
  assert.match(source, /sessionStorage/);
  assert.match(source, /function readAccountCache/);
  assert.match(source, /function writeAccountCache/);
  assert.match(source, /function clearAccountCache/);
  assert.match(source, /hydrateFromCache/);
  assert.match(source, /const hydrated = hydrateFromCache\(\)/);
  assert.match(source, /refresh\(\{ background: hydrated \}\)/);
  assert.match(source, /const background = options\?\.background === true/);
  assert.match(source, /if \(!background\) \{/);
  assert.match(source, /background && memoryAccountCache/);
});

test("system prompt includes Areeb creator identity across all modes", () => {
  const route = readFileSync(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
  const library = readFileSync(new URL("../lib/prompt-library.ts", import.meta.url), "utf8");
  // The creator identity lives in the versioned prompt library (shared persona)
  // and is consumed by the chat route via getPromptVersion("chat").
  assert.match(library, /created and engineered by Areeb, an AI Engineer/);
  assert.match(route, /getPromptVersion\("chat"\)/);
  for (const mode of ["fast", "smart", "creative", "coder"]) {
    assert.match(route, new RegExp(mode));
  }
});

test("studio pages render Back to Chat link", () => {
  for (const file of ["../components/anvik/creative-studio.tsx", "../components/anvik/vision-studio.tsx", "../components/anvik/artifacts-page.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /Back to Chat/);
    assert.match(source, /href="\/chat"/);
  }
});