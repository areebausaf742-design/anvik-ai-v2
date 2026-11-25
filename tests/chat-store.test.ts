import test from "node:test";
import assert from "node:assert/strict";

/**
 * Delete undo regression tests (audit P1).
 *
 * Deleting a conversation used to be immediate and irreversible. The store now
 * supports restoring the exact conversation (messages included), and the UI
 * offers a timed Undo action.
 */

type StorageShim = Storage & {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
  clear: () => void;
};

function createMemoryStorage(): StorageShim {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
  } as StorageShim;
}

const localStorageShim = createMemoryStorage();
(globalThis as Record<string, unknown>).localStorage = localStorageShim;

type StoreModule = typeof import("../store/use-chat-store");
let store: StoreModule["useChatStore"];

test.before(async () => {
  const module = await import("../store/use-chat-store");
  store = module.useChatStore;
});

test.beforeEach(() => {
  localStorageShim.clear();
  store.setState({ conversations: [], activeId: null, storageWarning: "" });
});

const chat = (id: string, title: string) => ({
  id,
  title,
  updatedAt: Date.now(),
  messages: [
    { id: `${id}-m1`, role: "user" as const, content: `hello from ${title}`, createdAt: Date.now() - 1000 },
    { id: `${id}-m2`, role: "assistant" as const, content: `reply in ${title}`, createdAt: Date.now() },
  ],
});

test("undo restores the deleted conversation and can reactivate it", () => {
  const first = chat("first", "First");
  const second = chat("second", "Second");
  store.setState({ conversations: [first, second], activeId: first.id });

  store.getState().deleteConversation(first.id);
  assert.deepEqual(store.getState().conversations.map((item) => item.id), ["second"]);
  assert.equal(store.getState().activeId, second.id);

  store.getState().restoreConversation(first, true);
  const state = store.getState();
  assert.deepEqual(state.conversations.map((item) => item.id), ["first", "second"]);
  assert.equal(state.activeId, first.id);
  assert.deepEqual(state.conversations[0].messages, first.messages, "messages are restored intact");
});

test("undoing a background delete leaves the active conversation alone", () => {
  const first = chat("first", "First");
  const second = chat("second", "Second");
  store.setState({ conversations: [first, second], activeId: first.id });

  store.getState().deleteConversation(second.id);
  store.getState().restoreConversation(second, false);

  const state = store.getState();
  assert.deepEqual(state.conversations.map((item) => item.id), ["second", "first"]);
  assert.equal(state.activeId, first.id);
});

test("restoring is idempotent and activates when nothing else is active", () => {
  const only = chat("only", "Only");
  store.setState({ conversations: [only], activeId: only.id });

  store.getState().deleteConversation(only.id);
  assert.equal(store.getState().activeId, null);

  store.getState().restoreConversation(only, false);
  assert.equal(store.getState().activeId, only.id, "an empty workspace activates the restored chat");

  store.getState().restoreConversation(only, false);
  assert.equal(store.getState().conversations.length, 1, "double undo cannot duplicate the chat");
});
