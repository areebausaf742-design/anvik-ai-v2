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
 * Required env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
 *
 * The server NEVER falls back to an anon/publishable key: those are browser
 * credentials scoped by RLS, and reusing them for privileged writes would
 * turn every write into an RLS denial (or worse, silently write into the
 * wrong access context). Privileged writes require the service-role key.
 */

const base = () =>
  (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");

const key = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY ??
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

/* ------------------------------------------------------------------ */
/* Error-aware reads/writes                                             */
/* ------------------------------------------------------------------ */

/**
 * A sanitized, category-level error for diagnostics. Never contains tokens,
 * secrets, keys or row payloads — only the PostgREST error code and a short
 * first-line message (or an error category for transport failures).
 */
export type SbError = {
  category: "table_missing" | "unique_violation" | "rls_denied" | "timeout" | "network_error" | "bad_response" | "http_error";
  status?: number;
  detail?: string;
};

export type SbWriteResult = { ok: true } | { ok: false; error: SbError };
export type SbReadResult<T> = { ok: true; rows: T[] } | { ok: false; error: SbError };

function sanitizePostgRESTError(body: unknown): { code?: string; detail?: string } {
  if (!body || typeof body !== "object") return {};
  const obj = body as Record<string, unknown>;
  const code = typeof obj.code === "string" ? obj.code.slice(0, 32) : undefined;
  const message =
    typeof obj.message === "string" ? obj.message :
    typeof obj.msg === "string" ? obj.msg :
    typeof obj.error === "string" ? obj.error :
    typeof obj.error_description === "string" ? obj.error_description : "";
  // Keep only the first line, bounded — no row data ever travels here.
  const detail = message.split("\n")[0].slice(0, 160);
  return { code, detail: detail || undefined };
}

function categoryFor(err: { code?: string; status?: number; detail?: string }): SbError {
  const detail = err.detail ?? "";
  const code = err.code ?? "";
  if (err.status === 404 || /42P01/.test(code) || /relation .* does not exist/i.test(detail) || /not found/i.test(detail)) {
    return { category: "table_missing", status: err.status, detail };
  }
  if (err.status === 401 || err.status === 403 || /row-level security/i.test(detail)) {
    return { category: "rls_denied", status: err.status, detail };
  }
  if (/23505/.test(code) || /duplicate key/i.test(detail)) {
    return { category: "unique_violation", status: err.status, detail };
  }
  return { category: "http_error", status: err.status, detail };
}

async function sbReject(response: Response, body: unknown): Promise<SbError> {
  const { code, detail } = sanitizePostgRESTError(body);
  return categoryFor({ code, status: response.status, detail });
}

export async function sbUpdateByIdDetailed(table: string, id: string, patch: Record<string, unknown>): Promise<SbWriteResult> {
  if (!supabaseEnabled()) return { ok: false, error: { category: "bad_response", detail: "supabase not configured" } };
  try {
    const response = await fetch(`${base()}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...headers(), Prefer: "return=minimal" },
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) return { ok: true };
    const body = await response.json().catch(() => null);
    return { ok: false, error: await sbReject(response, body) };
  } catch (e) {
    const isAbort = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
    return { ok: false, error: { category: isAbort ? "timeout" : "network_error" } };
  }
}

/**
 * Insert rows — a plain INSERT, no merge semantics.
 *
 * `Prefer: resolution=merge-duplicates` was previously sent here, which made
 * every "insert" an upsert resolved against the PRIMARY KEY. That silently
 * broke two different things:
 *   - a duplicate `(ip_hash, date)` quota row raised 23505 instead of
 *     incrementing the counter, so the free daily cap never advanced; and
 *   - "append-only history" rows could be overwritten by an id collision.
 * A real INSERT is what the callers of this function actually want.
 */
export async function sbInsertDetailed(table: string, rows: Record<string, unknown>[]): Promise<SbWriteResult> {
  if (!supabaseEnabled() || rows.length === 0) return { ok: false, error: { category: "bad_response", detail: "supabase not configured or no rows" } };
  try {
    const response = await fetch(`${base()}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...headers(), Prefer: "return=minimal" },
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) return { ok: true };
    const body = await response.json().catch(() => null);
    return { ok: false, error: await sbReject(response, body) };
  } catch (e) {
    const isAbort = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
    return { ok: false, error: { category: isAbort ? "timeout" : "network_error" } };
  }
}

/**
 * Upsert rows by an EXPLICIT conflict target.
 *
 * PostgREST resolves `merge-duplicates` against the primary key unless
 * `on_conflict=<cols>` names the unique constraint to arbitrate on. Omitting it
 * was the root cause of the dead free-tier counter (see P1-2): `quota_usage`
 * is keyed by `id` (a random uuid) with a separate unique `(ip_hash, date)`,
 * so every second write for the same visitor/date raised 23505 and the count
 * froze at 1 forever.
 *
 * `conflict` is required — there is no safe default, and a silent fallback to
 * the primary key is exactly the bug this replaces.
 */
export async function sbUpsertDetailed(
  table: string,
  rows: Record<string, unknown>[],
  conflict: string,
): Promise<SbWriteResult> {
  const target = conflict.trim();
  if (!target) {
    return { ok: false, error: { category: "bad_response", detail: "upsert requires an explicit conflict target" } };
  }
  if (!supabaseEnabled() || rows.length === 0) {
    return { ok: false, error: { category: "bad_response", detail: "supabase not configured or no rows" } };
  }
  try {
    const response = await fetch(`${base()}/rest/v1/${table}?on_conflict=${encodeURIComponent(target)}`, {
      method: "POST",
      headers: { ...headers(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) return { ok: true };
    const body = await response.json().catch(() => null);
    return { ok: false, error: await sbReject(response, body) };
  } catch (e) {
    const isAbort = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
    return { ok: false, error: { category: isAbort ? "timeout" : "network_error" } };
  }
}

export async function sbSelectDetailed<T>(table: string, query: string): Promise<SbReadResult<T>> {
  if (!supabaseEnabled()) return { ok: false, error: { category: "bad_response", detail: "supabase not configured" } };
  try {
    const response = await fetch(`${base()}/rest/v1/${table}?${query}`, {
      headers: headers(),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return { ok: false, error: await sbReject(response, body) };
    }
    const rows: unknown = await response.json();
    return { ok: true, rows: Array.isArray(rows) ? (rows as T[]) : [] };
  } catch (e) {
    const isAbort = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
    return { ok: false, error: { category: isAbort ? "timeout" : "network_error" } };
  }
}

/** Insert rows, ignoring duplicates. Returns true when the write landed. */
export async function sbInsert(table: string, rows: Record<string, unknown>[]): Promise<boolean> {
  return (await sbInsertDetailed(table, rows)).ok;
}

/**
 * Upsert rows by their conflict columns (PostgREST merge-duplicates).
 * Requires a unique constraint on the conflict columns — see the migration.
 * `conflict` is mandatory: see sbUpsertDetailed for why a default is unsafe.
 * Never throws; returns false on any failure.
 */
export async function sbUpsert(
  table: string,
  rows: Record<string, unknown>[],
  conflict: string,
): Promise<boolean> {
  return (await sbUpsertDetailed(table, rows, conflict)).ok;
}

/**
 * Call a PostgREST RPC (stored function). Returns the parsed JSON result or
 * null on any failure. All server-side, service-role — never exposed to the
 * browser.
 */
export async function sbRpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  if (!supabaseEnabled()) return null;
  try {
    const response = await fetch(`${base()}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
