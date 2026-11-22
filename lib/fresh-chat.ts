/**
 * Fresh-chat initialization — the "start with a clean chat" contract.
 *
 * Root cause (fixed here): the chat store persisted `activeId` and the full
 * conversation list in localStorage, and the workspace rendered the persisted
 * active conversation on every mount. A genuinely new browser tab or app
 * session therefore resumed the previous conversation instead of starting
 * fresh, and repeated mounts could not distinguish "new tab" from "same tab".
 *
 * This module makes fresh-chat initialization explicit and one-time:
 *
 *  - `ensureFreshChat()` runs once per browser tab. A tab whose sessionStorage
 *    still says "initialized" is a same-tab reload or route navigation, so it
 *    must preserve the current conversation and create nothing.
 *  - `requestFreshChat()` is the explicit channel for the login / OAuth /
 *    onboarding boundary: it records a one-shot pending request that the next
 *    workspace mount consumes — creating exactly one fresh conversation.
 *
 * sessionStorage (not localStorage) is the correct scope: it is per browser
 * tab and survives same-tab reloads, which is exactly the browser-tab
 * distinction the product contract asks for.
 */

import { useChatStore } from "@/store/use-chat-store";

const TAB_INIT_KEY = "anvik-chat-tab-init";
const FRESH_REQUEST_KEY = "anvik-chat-fresh-request";

/** Per-JS-realm guard for the same-tab navigation path. */
let tabInitialized = false;

function storage(): Storage | null {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch {
    // Private mode / SSR / sandbox — treated as "no storage".
  }
  return null;
}

/**
 * Ask the next chat-workspace mount to start with a fresh conversation.
 * Safe to call repeatedly — only the first-pending marker is consumed.
 */
export function requestFreshChat(): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(FRESH_REQUEST_KEY, "1");
  } catch {
    // Storage quota/unavailable — the tab-init contract still applies.
  }
}

/**
 * Reset the in-realm guard. Exported for tests and no other reason — the app
 * code never calls this. It exists so a reload-like boot (a fresh module realm
 * whose sessionStorage still says "initialized") can be simulated.
 */
export function _resetFreshChatModuleState(): void {
  tabInitialized = false;
}

/** Consume a pending fresh-chat request exactly once (true if one existed). */
export function consumeFreshChatRequest(): boolean {
  const s = storage();
  if (!s) return false;
  try {
    const pending = s.getItem(FRESH_REQUEST_KEY);
    if (pending === "1") {
      s.removeItem(FRESH_REQUEST_KEY);
      return true;
    }
  } catch {
    // ignore — fall through to false
  }
  return false;
}

/**
 * Ensure this browser tab starts with a fresh, empty conversation.
 *
 * Returns true if a new conversation was created and selected, false
 * otherwise. Idempotent per tab and per pending request, safe under
 * React Strict Mode double-effects:
 *
 *  - New tab (never initialized here): create + select one fresh conversation.
 *  - Explicit fresh request (login / OAuth / onboarding): consume the marker
 *    and create + select exactly one fresh conversation — even in a tab where
 *    a conversation is already active.
 *  - Same-tab reload / navigation with no pending request: no-op — the
 *    current active conversation is preserved.
 *
 * Existing conversations are never cleared, overwritten or deleted: the
 * store prepends the new conversation and selects it.
 */
export function ensureFreshChat(): boolean {
  const requested = consumeFreshChatRequest();
  const s = storage();
  const seen =
    tabInitialized || (s !== null && s.getItem(TAB_INIT_KEY) === "1");

  if (!requested && seen) return false;

  tabInitialized = true;
  if (s) {
    try {
      s.setItem(TAB_INIT_KEY, "1");
    } catch {
      // ignore — the in-realm flag still prevents duplicates for this tab
    }
  }
  useChatStore.getState().createConversation();
  return true;
}
