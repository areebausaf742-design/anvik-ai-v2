/**
 * One owner for the persisted chat store.
 *
 * The store is backed by localStorage under a per-account key
 * (`anvik-chat-history:<userId>`), so *who is signed in* decides *which
 * conversations exist*. Only `/chat` used to perform that switch. `/projects`
 * read `useChatStore` directly, so a direct visit or a refresh of `/projects`
 * read whatever key the store happened to be on — the guest namespace — and
 * showed empty or stale history for a signed-in user.
 *
 * This module is the single place that performs the switch, so every surface
 * that reads history goes through the same identity rules:
 *
 *   1. wait until identity is verified (`sessionLoading` false, and a session
 *      implies a loaded profile) — never hydrate as "guest" and then correct it
 *   2. key the store by the verified user id, or "guest" when signed out
 *   3. if the owner did not change, do nothing (re-renders must not rehydrate)
 *   4. clear the in-memory state BEFORE rehydrating, because persist() writes
 *      the current state into the new key on the way through — without this the
 *      account's saved conversations get overwritten by the previous owner's
 *
 * Returns `false` when identity is not settled yet, so callers can hold their
 * UI in a loading state instead of flashing an empty history.
 */

import { accountStorageKey } from "@/lib/account-storage";
import { setLearningOwner } from "@/lib/learning";
import { useChatStore } from "@/store/use-chat-store";

export type IdentitySync = {
  /** Stable owner key: the verified user id, or "guest". */
  owner: string;
  /** True when this call (re)hydrated the store, so the caller can reload data. */
  switched: boolean;
};

export const CHAT_HISTORY_BASE_KEY = "anvik-chat-history";

/**
 * Point the chat store at the given owner's data.
 *
 * `owner` must be the server-verified user id or "guest" — never a
 * client-supplied device id or a name from the URL.
 */
export async function activateChatOwner(owner: string): Promise<void> {
  const storageKey = accountStorageKey(CHAT_HISTORY_BASE_KEY, owner === "guest" ? null : owner);

  // The learning profile is scoped per owner too; switching it here keeps the
  // two in lockstep instead of letting each surface set it independently.
  setLearningOwner(owner);

  try {
    const previousAccountData = window.localStorage.getItem(storageKey);
    useChatStore.persist.setOptions({ name: storageKey });
    // Reset the OWNER'S DATA in memory first — see rule 4 in the module comment.
    //
    // Only conversations and the active pointer are account-scoped. `mode` and
    // `temperature` are a device-level preference, so clearing them here would
    // silently discard the user's chosen mode every time they signed in.
    useChatStore.setState({
      conversations: [],
      activeId: null,
      storageWarning: "",
    });
    // persist() may have just written the empty state over the new key; put the
    // owner's saved value back before rehydrating it.
    if (previousAccountData) window.localStorage.setItem(storageKey, previousAccountData);
    await Promise.resolve(useChatStore.persist.rehydrate());
  } catch {
    // Storage unavailable (private mode, quota): an in-memory session is still
    // usable, so fall back to an empty store rather than throwing at the caller.
    useChatStore.setState({ conversations: [], activeId: null });
  }
}

/**
 * Resolve the owner for the current session, or `null` while identity is still
 * being verified. Pure — no side effects, so it is safe in a render.
 */
export function resolveChatOwner(options: {
  sessionLoading: boolean;
  hasSession: boolean;
  hasProfile: boolean;
  userId: string | null | undefined;
}): string | null {
  if (options.sessionLoading) return null;
  // A session without its profile has not been verified for display yet.
  if (options.hasSession && !options.hasProfile) return null;
  const id = typeof options.userId === "string" ? options.userId.trim() : "";
  return id ? id : "guest";
}
