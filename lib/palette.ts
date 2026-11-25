/**
 * Command-palette filtering.
 *
 * The palette used to share the sidebar's `search` state and pressing Enter
 * sent the query to the chat API. Keeping the matching rules here makes the
 * palette independent of the sidebar filter and testable without a DOM.
 */

export function filterPaletteChats<T extends { title: string }>(
  chats: T[],
  query: string,
  limit = 6,
): T[] {
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? chats.filter((chat) => chat.title.toLowerCase().includes(needle))
    : chats;
  return matches.slice(0, Math.max(0, limit));
}

export function filterPaletteActions<T extends { label: string }>(
  actions: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return actions;
  return actions.filter((action) => action.label.toLowerCase().includes(needle));
}
