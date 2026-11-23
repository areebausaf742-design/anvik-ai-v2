import assert from "node:assert/strict";
import test from "node:test";
import { emailFallbackName, greetingFirstName } from "../lib/session";
import { accountStorageKey } from "../lib/account-storage";
import { readMemory, setLearningOwner, writeMemory } from "../lib/learning";
import { normalizeSearchMode, shouldAutoSearch } from "../lib/search";

test("email fallback uses the first readable name and strips a trailing numeric suffix", () => {
  assert.equal(emailFallbackName("ravi237@gmail.com"), "Ravi");
  assert.equal(emailFallbackName("ravi.kumar@example.com"), "Ravi");
  assert.equal(emailFallbackName("12345@example.com"), "Friend");
});

test("greeting uses only the first word of the verified profile name", () => {
  assert.equal(greetingFirstName("Ravi Sharma", "ravi237@gmail.com"), "Ravi");
  assert.equal(greetingFirstName("ravi237", "ravi237@gmail.com"), "Ravi");
  assert.equal(greetingFirstName("", "ravi237@gmail.com"), "Ravi");
});


test("web search mode accepts Auto, Deep and Off explicitly", () => {
  assert.equal(normalizeSearchMode("auto"), "auto");
  assert.equal(normalizeSearchMode("on"), "on");
  assert.equal(normalizeSearchMode("off"), "off");
  assert.equal(normalizeSearchMode("invalid"), "auto");
});

test("Auto web search activates for current facts and explicit research intent", () => {
  assert.equal(shouldAutoSearch("What is the latest Windows release?"), true);
  assert.equal(shouldAutoSearch("Research current AI safety papers and cite sources"), true);
  assert.equal(shouldAutoSearch("Explain how a Java for-loop works"), false);
});

test("browser storage namespaces are distinct for each account and guest", () => {
  assert.equal(accountStorageKey("anvik-chat-history", "user-a"), "anvik-chat-history:user-a");
  assert.equal(accountStorageKey("anvik-chat-history", "user-b"), "anvik-chat-history:user-b");
  assert.equal(accountStorageKey("anvik-memory", null), "anvik-memory:guest");
  assert.notEqual(
    accountStorageKey("anvik-chat-history", "user-a"),
    accountStorageKey("anvik-chat-history", "user-b"),
  );
});

test("browser memory remains separated by account and ignores legacy unscoped values", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>([["anvik-memory", JSON.stringify({ name: "LegacyName" })]]);
  const fakeWindow = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, String(value)),
      removeItem: (key: string) => values.delete(key),
    },
  } as unknown as Window;

  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  try {
    setLearningOwner("account-a");
    assert.equal(readMemory().name, "");
    writeMemory({ name: "Alice" });

    setLearningOwner("account-b");
    assert.equal(readMemory().name, "");
    writeMemory({ name: "Bob });

    setLearningOwner("account-a");
    assert.equal(readMemory().name, "Alice");
    setLearningOwner("account-b");
    assert.equal(readMemory().name, "Bob");
  } finally {
    setLearningOwner("guest");
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
