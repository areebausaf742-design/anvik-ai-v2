/**
 * Optional Supabase (PostgREST) adapter — plain `fetch`, no SDK, no bundle cost.
 *
 * Activated only when SUPABASE_URL and a key are present. Every call is
 * best-effort: it never throws and never blocks a response. When the env vars
 * are absent the product runs on the in-memory store in `lib/store.ts`, which
 * is also what keeps /j/[slug], /sitemap.xml and /api/ask alive on a read-only
 * filesystem (Vercel) instead of returning 500.
 *
 * New schema (migration in `supabase/migrations/`):
 *   chats        — one row per ANVIK conversation
 *   messages     — one row per user and per assistant turn, with model_used
 *   quota_usage  — one row per (ip_hash, day), count of free answers used
 *
 * All three tables are RLS-enabled: anon may insert/select chats (their own,
 * keyed by user_id) and messages that belong to such a chat; quota_usage has
 * NO anon policies — it is server-only. The server writes via the service-role
 * key, which bypasses RLS entirely.
 *
 * Required env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 * (or SUPABASE_ANON_KEY/SUPABASE_SERVICE_KEY as fallbacks).
 */

const base = () =>
  (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");

const key = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export function supabaseEnabled(): boolean {
  return Boolean(base() && key());
}

function headers(): Record<string, string> {
  const k = key();
  return {
    apikey: k,
    Authorization: `Bearer ${k}`,
    "Content-Type": "application/json",
  };
}

/** Read rows. Returns null on any failure (missing table, bad key, offline). */
export async function sbSelect<T>(table: string, query: string): Promise<T[] | null> {
  if (!supabaseEnabled()) return null;
  try {
    const response = await fetch(`${base()}/rest/v1/${table}?${query}`, {
      headers: headers(),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const rows: unknown = await response.json();
    return Array.isArray(rows) ? (rows as T[]) : null;
  } catch {
    return null;
  }
}

/** Insert rows, ignoring duplicates. Returns true when the write landed. */
export async function sbInsert(table: string, rows: Record<string, unknown>[]): Promise<boolean> {
  if (!supabaseEnabled() || rows.length === 0) return false;
  try {
    const response = await fetch(`${base()}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...headers(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(4000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Upsert rows by their conflict columns (PostgREST merge-duplicates).
 * Requires a unique constraint on the conflict columns — see the migration.
 * Never throws; returns false on any failure.
 */
export async function sbUpsert(table: string, rows: Record<string, unknown>[]): Promise<boolean> {
  if (!supabaseEnabled() || rows.length === 0) return false;
  try {
    const response = await fetch(`${base()}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...headers(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(4000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
