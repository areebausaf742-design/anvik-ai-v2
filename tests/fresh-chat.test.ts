/* Fresh-chat initialization — regression tests for the conversation-startup contract:
   new browser tabs start fresh, same-tab reloads preserve the active conversation,
   navigation never duplicates, and the login / OAuth / onboarding boundary produces
   exactly one fresh conversation.

   The store is imported dynamically AFTER the storage shims are installed, because
   zustand persist reads localStorage at store-creation time. */
import test from "node:test";
import assert from "node:assert/strict";

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
const sessionStorageShim = createMemoryStorage();

(globalThis as Record<string, unknown>).localStorage = localStorageShim;
(globalThis as Record<string, unknown>).sessionStorage = sessionStorageShim;

type FreshChatModule = typeof import("../lib/fresh-chat");
type StoreModule = typeof import("../store/use-chat-store");

let freshChat: FreshChatModule;
let store: StoreModule;
let resetModuleState: () => void;

type SeedMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: number };
type SeedConversation = { id: string; title: string; updatedAt: number; messages: SeedMessage[] };

function seedConversation(id: string, title: string, messageCount = 0, updatedAtAgoMs = 60_000): SeedConversation {
  const messages: SeedMessage[] = Array.from({ length: messageCount }, (_, i) => ({
    id: `${id}-m${i}`,
    role: i % 2 === 0 ? "user" : "assistant",
    content: `message ${i} in ${title}`,
    createdAt: Date.now() - i * 1000 - updatedAtAgoMs,
  }));
  return { id, title, updatedAt: Date.now() - updatedAtAgoMs, messages };
}

function activeId(): string | null {
  return store.useChatStore.getState().activeId;
}

function conversations() {
  return store.useChatStore.getState().conversations;
}

test.before(async () => {
  const fresh = await import("../lib/fresh-chat");
  const storeModule = await import("../store/use-chat-store");
  freshChat = fresh;
  store = storeModule;
  resetModuleState = fresh._resetFreshChatModuleState;
});

test.beforeEach(() => {
  resetModuleState();
  sessionStorageShim.clear();
  localStorageShim.clear();
  store.useChatStore.setState({
    conversations: [],
    activeId: null,
    storageWarning: "",
  });
});

/* ---------------------------- New tab → fresh conversation ---------------------------- */

test("a genuinely new browser tab starts with a fresh, empty conversation", () => {
  const oldA = seedConversation("old-a", "Old conversation A", 4);
  const oldB = seedConversation("old-b", "Old conversation B", 2, 120_000);
  store.useChatStore.setState({ conversations: [oldA, oldB], activeId: oldA.id });

  const created = freshChat.ensureFreshChat();

  assert.equal(created, true, "new tab should create one conversation");
  const state = store.useChatStore.getState();
  assert.equal(state.conversations.length, 3);
  const fresh = state.conversations[0];
  assert.notEqual(fresh.id, oldA.id);
  assert.notEqual(fresh.id, oldB.id);
  assert.equal(fresh.title, "New conversation");
  assert.equal(fresh.messages.length, 0, "new conversation starts empty");
  assert.equal(state.activeId, fresh.id, "the fresh conversation is selected");
  const oldAAfter = state.conversations.find((c) => c.id === oldA.id);
  const oldBAfter = state.conversations.find((c) => c.id === oldB.id);
  assert.ok(oldAAfter && oldBAfter, "previous conversations remain saved");
  assert.equal(oldAAfter.messages.length, 4, "previous conversation messages unchanged");
  assert.equal(oldBAfter.messages.length, 2);
});

test("a new tab with no history still yields one fresh conversation", () => {
  const created = freshChat.ensureFreshChat();
  assert.equal(created, true);
  assert.equal(conversations().length, 1);
  assert.equal(conversations()[0].messages.length, 0);
  assert.equal(activeId(), conversations()[0].id);
});

/* --------------------- Same-tab reload preserves history --------------------- */

test("same-tab refresh preserves the currently active conversation", () => {
  const conv = seedConversation("keep-me", "Keep me", 6);
  store.useChatStore.setState({ conversations: [conv], activeId: conv.id });
  sessionStorageShim.setItem("anvik-chat-tab-init", "1");

  const created = freshChat.ensureFreshChat();

  assert.equal(created, false, "same-tab reload must not create a conversation");
  assert.equal(conversations().length, 1);
  assert.equal(conversations()[0].id, conv.id);
  assert.equal(conversations()[0].messages.length, 6);
  assert.equal(activeId(), conv.id);
});

/* -------------------- Refresh-like boot (module state resets) -------------------- */

test("a reload-like boot with a persisted tab marker stays idempotent", () => {
  const prevSessionStorage = sessionStorageShim.getItem("anvik-chat-tab-init");
  assert.equal(prevSessionStorage, null);

  // Simulate the persisted tab marker from the previous page load, in a
  // fresh module realm (resetModuleState above emulates the reload realm).
  sessionStorageShim.setItem("anvik-chat-tab-init", "1");

  const conv = seedConversation("boot", "Boot", 2);
  store.useChatStore.setState({ conversations: [conv], activeId: conv.id });

  const created = freshChat.ensureFreshChat();

  assert.equal(created, false);
  assert.equal(conversations().length, 1);
  assert.equal(activeId(), conv.id);
});

/* ---------------- Navigation between routes — no duplicates ---------------- */

test("repeated ensureFreshChat calls (route navigation / Strict Mode) create exactly one conversation", () => {
  const conv = seedConversation("route-one", "Route one", 3);
  store.useChatStore.setState({ conversations: [conv], activeId: conv.id });

  // Simulate Strict Mode double-effects and route remounts.
  const first = freshChat.ensureFreshChat();
  const second = freshChat.ensureFreshChat();
  const third = freshChat.ensureFreshChat();

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(third, false);
  assert.equal(conversations().length, 2, "exactly one conversation created");
  assert.equal(conversations()[0].messages.length, 0);
  assert.equal(conversations()[1].id, conv.id);
});

/* -------------- Login / OAuth / onboarding boundary — one fresh -------------- */

test("an explicit fresh request (login, OAuth, onboarding) creates exactly one conversation", () => {
  // Tab already initialized (same tab, already on the app).
  sessionStorageShim.setItem("anvik-chat-tab-init", "1");
  const conv = seedConversation("pre-login", "Pre login", 5);
  store.useChatStore.setState({ conversations: [conv], activeId: conv.id });

  freshChat.requestFreshChat();
  const created = freshChat.ensureFreshChat();
  const createdAgain = freshChat.ensureFreshChat();

  assert.equal(created, true);
  assert.equal(createdAgain, false, "pending request is consumed exactly once");
  assert.equal(conversations().length, 2);
  const fresh = conversations()[0];
  assert.equal(fresh.title, "New conversation");
  assert.equal(fresh.messages.length, 0);
  assert.equal(activeId(), fresh.id);
  assert.equal(conversations()[1].id, conv.id, "pre-login history is preserved");
  assert.equal(conversations()[1].messages.length, 5);
});

test("a fresh request combined with a cold module (new reload) still creates exactly one", () => {
  // Simulate the OAuth return into a fresh tab-realm: module reset happened
  // in beforeEach, the tab marker is absent, but a request was pending.
  freshChat.requestFreshChat();
  const created = freshChat.ensureFreshChat();
  const again = freshChat.ensureFreshChat();

  assert.equal(created, true);
  assert.equal(again, false);
  assert.equal(conversations().length, 1);
});

test("a second login-style fresh request creates exactly one additional conversation", () => {
  sessionStorageShim.setItem("anvik-chat-tab-init", "1");
  const conv = seedConversation("first", "First", 1);
  store.useChatStore.setState({ conversations: [conv], activeId: conv.id });

  freshChat.requestFreshChat();
  freshChat.ensureFreshChat();
  assert.equal(conversations().length, 2);

  // Sign-out → sign-in again: the second boundary consumes its own marker.
  freshChat.requestFreshChat();
  freshChat.ensureFreshChat();
  assert.equal(conversations().length, 3, "one fresh conversation per login boundary");
});

/* --------------------------- New button --------------------------- */

test("New button creates and selects a fresh empty conversation and preserves history", () => {
  const conv = seedConversation("new-btn-old", "Old", 4);
  store.useChatStore.setState({ conversations: [conv], activeId: conv.id });

  const id = store.useChatStore.getState().createConversation();

  const state = store.useChatStore.getState();
  assert.equal(state.conversations.length, 2);
  assert.equal(state.activeId, id);
  assert.equal(state.conversations[0].id, id);
  assert.equal(state.conversations[0].messages.length, 0);
  assert.equal(state.conversations[1].id, conv.id, "history preserved");
  assert.equal(state.conversations[1].messages.length, 4);
});

/* ------------------- Selecting an old chat ------------------- */

test("selecting an old conversation from the sidebar restores exactly that conversation", () => {
  const oldA = seedConversation("old-a", "Old A", 5);
  const oldB = seedConversation("old-b", "Old B", 3, 120_000);
  store.useChatStore.setState({ conversations: [oldA, oldB], activeId: oldA.id });

  store.useChatStore.getState().setActive(oldB.id);

  const active = store.selectActiveConversation(store.useChatStore.getState());
  assert.ok(active);
  assert.equal(active.id, oldB.id);
  assert.equal(active.title, "Old B");
  assert.equal(active.messages.length, 3);
  assert.equal(active.messages[0].role, "user");
  assert.equal(active.messages[1].role, "assistant");
  assert.equal(active.messages[0].content, "message 0 in Old B");
});

test("selecting a chat while a same-tab fresh request is pending leaves exactly one new conversation", () => {
  const oldConv = seedConversation("old-select", "Old", 2);
  store.useChatStore.setState({ conversations: [oldConv], activeId: oldConv.id });
  sessionStorageShim.setItem("anvik-chat-tab-init", "1");

  freshChat.requestFreshChat();
  freshChat.ensureFreshChat();
  assert.equal(conversations().length, 2);

  // User navigates to an old conversation — must not create anything more.
  store.useChatStore.getState().setActive(oldConv.id);
  freshChat.ensureFreshChat();

  assert.equal(conversations().length, 2, "no duplicate conversation");
  assert.equal(activeId(), oldConv.id);
});
