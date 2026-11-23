/**
 * Namespaced browser storage keys for account-owned local data.
 * The user id must come from the verified session provider; null means guest.
 */
export function accountStorageKey(base: string, userId: string | null | undefined): string {
  const owner = typeof userId === "string" && userId.trim() ? userId.trim() : "guest";
  return `${base}:${encodeURIComponent(owner)}`;
}
