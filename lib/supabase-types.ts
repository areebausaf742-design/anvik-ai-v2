/**
 * Immutable read-only key/value interface for the Supabase REST adapter.
 */
export type SupabaseReadFn = <T = unknown>(table: string, query: string) => Promise<T[] | null>;
/**
 * Insert rows. Returns true when the write landed.
 */
export type SupabaseInsertFn = (table: string, rows: Record<string, unknown>[]) => Promise<boolean>;
/**
 * Upsert rows against an explicit unique constraint (`on_conflict`).
 */
export type SupabaseUpsertFn = (
  table: string,
  rows: Record<string, unknown>[],
  conflict: string,
) => Promise<boolean>;
