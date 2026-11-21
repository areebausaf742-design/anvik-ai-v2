/**
 * Optional Supabase (PostgREST) adapter — plain `fetch`, no SDK, no bundle cost.
 *
 * Activated only when SUPABASE_URL and a key are present. Every call is
 * best-effort: it never throws and never blocks a response. When the env vars
 * are absent the product runs on the in-memory store in `lib/store.ts`, which
 * is also what keeps /j/[slug], /sitemap.xml and /api/ask alive on a read-only
 * filesystem (Vercel) instead of returning 500.
 *
 * Expected schema — create once in the Supabase SQL editor:
 *
 *   create table if not exists anvik_questions (
 *     id text primary key, device_id text not null, text text not null,
 *     lang text not null, slug text, idempotency_key text,
 *     created_at bigint not null, status text not null
 *   );
 *   create table if not exists anvik_answers (
 *     id text primary key, question_id text not null, body text not null,
 *     model text not null, prompt_tokens int, output_tokens int,
 *     cached_tokens int, cost_paise int, latency_ms int,
 *     is_public boolean, published_at bigint not null,
 *     moderation_state text not null, reviewed boolean not null,
 *     lang text not null, slug text not null
 *   );
 *   create index if not exists anvik_answers_slug on anvik_answers (slug);
 *   create index if not exists anvik_answers_public on anvik_answers (is_public, reviewed);
 *   create table if not exists anvik_moderation (
 *     id text primary key, question_text text, stage text, reason_code text,
 *     action text, created_at bigint not null
 *   );
 *   alter table anvik_questions enable row level security;
 *   alter table anvik_answers enable row level security;
 *   alter table anvik_moderation enable row level security;
 *   -- server side only: the service-role key bypasses RLS, the anon key must not write.
 */

const base = () => (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const key = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
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
