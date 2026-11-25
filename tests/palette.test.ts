import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Command palette regression tests (audit P1).
 *
 * Enter used to send the palette query to the chat API, and the palette shared
 * the sidebar's filter state. The palette now filters independently and Enter
 * activates the highlighted result.
 */

test("palette chat matching is independent, case-insensitive and capped", async () => {
  const { filterPaletteChats } = await import("../lib/palette");
  const chats = [
    { id: "1", title: "Alpha launch" },
    { id: "2", title: "Beta review" },
    { id: "3", title: "Alpha follow-up" },
  ];

  assert.deepEqual(filterPaletteChats(chats, "ALPHA").map((chat) => chat.id), ["1", "3"]);
  assert.deepEqual(filterPaletteChats(chats, "  beta  ").map((chat) => chat.id), ["2"]);
  assert.equal(filterPaletteChats(chats, "", 2).length, 2);
  assert.equal(filterPaletteChats(chats, "missing").length, 0);
});

test("palette actions filter by label and remain available with an empty query", async () => {
  const { filterPaletteActions } = await import("../lib/palette");
  const actions = [{ label: "New chat" }, { label: "Image Studio" }, { label: "Settings" }];

  assert.deepEqual(filterPaletteActions(actions, "image").map((item) => item.label), ["Image Studio"]);
  assert.equal(filterPaletteActions(actions, "").length, 3);
  assert.equal(filterPaletteActions(actions, "vision").length, 0);
});

test("roving index moves from the focused item and wraps in both directions", async () => {
  const { wrapIndex } = await import("../lib/keyboard-nav");
  assert.equal(wrapIndex(0, 1, 3), 1);
  assert.equal(wrapIndex(2, 1, 3), 0);
  assert.equal(wrapIndex(0, -1, 3), 2);
  assert.equal(wrapIndex(-1, 1, 3), 0);
  assert.equal(wrapIndex(-1, -1, 3), 2);
  assert.equal(wrapIndex(0, 1, 0), -1);
});

test("the palette no longer sends chat or shares the sidebar search state", () => {
  const source = readFileSync(
    new URL("../components/anvik/chat-workspace.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /sendMessage\(\s*(search|paletteQuery)\s*\)/, "Enter must never send a chat");
  assert.match(source, /aria-activedescendant/, "the combobox must expose the highlighted result");
  assert.match(source, /role="listbox"/);
  assert.match(source, /paletteQuery/);
  assert.doesNotMatch(source, /value=\{search\}\s*\n\s*onChange=\{\(e\) => setSearch/, "palette input must not use sidebar search");
});
