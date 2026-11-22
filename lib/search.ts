/**
 * Web Search — the intelligent research layer behind ANVIK's chat composer.
 *
 * The pipeline is honest: search results are only ever used to ground a live
 * Gemini answer. Nothing is served from a corpus or cache. When the web
 * search cannot be used (or a question does not need it), the answer still
 * comes live from Gemini, labelled honestly by the UI.
 *
 * Three modes:
 *   "auto" — ANVIK decides, a deterministic rule-based classifier — no extra
 *            model call, no added latency.
 *   "on"   — always search the web.
 *   "off"  — never search the web.
 */

export type SearchMode = "auto" | "on" | "off";

export type SearchStatus = "on" | "off" | "unavailable";

export type SearchSource = {
  title: string;
  uri: string;
  domain: string;
};

export type SearchMeta = {
  queries: string[];
  sources: SearchSource[];
};

export function normalizeSearchMode(value: unknown): SearchMode {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v === "on" || v === "off" || v === "auto" ? (v as SearchMode) : "auto";
}

/**
 * Conservative, deterministic decision for Auto mode.
 *
 * Auto searches only when the question clearly needs information that goes
 * stale or belongs to a current timeline: time references, recent events
 * (news, elections, scores, prices, weather, launches), explicit research
 * intent, or a recent four-digit year. Anything else — static knowledge,
 * code, math, reasoning — stays ungrounded so it stays fast and cheap.
 */
export function shouldAutoSearch(query: string): boolean {
  const text = query.trim();
  if (!text) return false;

  const patterns: RegExp[] = [
    // Time references — the answer goes stale the moment it is written.
    /\b(?:today|tonight|this morning|this evening|this week|this month|this year|today's|yesterday|last week|last night|this weekend|this quarter|this season|just now)\b/i,
    // Current events and fast-moving facts.
    /\b(?:latest|recent|recently|current|currently|breaking|just in|just released|now|trending|viral|upcoming|new(?:ly)?(?: released| launched| announced)?|announce(?:ment|d)|launch(?:ed|es|ing)|news|headlines?|update|updates|story|stories|live|live score|score|scores|match|matches|matches\b|win|won|winners?|winner|champion|championship|finals?|season|election|elections|vote|votes|weather|forecast|price|prices|pricing|stocks?|markets?|time in|timings?|schedule|upcoming|calendar|released|release|newsletter|announce(?:s|d|ments)?|tech (?:news|trends?)|release notes|lawsuit|arrest|death(?:s|ing)|trag(?:y|edy)|scam|hoax|rumour|rumor)\b/i,
    // Year stamps — anything from the recent past can change.
    /\b(?:202[2-9])\b/,
    // Explicit research intent.
    /\b(?:search|research|find out|find|look up|look it up|get the latest|get the news|get the current|pull up|fetch|look at the web|search the web)\b/i,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

/** Best-effort hostname from an arbitrary URI, for display and de-duplication. */
export function domainOf(uri: string): string {
  try {
    const host = new URL(uri).hostname.toLowerCase();
    return host.replace(/^www\./, "") || uri;
  } catch {
    return uri;
  }
}

/** Parse + validate a grounding URI; returns the parsed URL or null. */
function parseUri(uri: string): URL | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Clean a single grounding chunk into a display-ready source.
 * Returns null when the chunk has nothing meaningful to show.
 */
export function normalizeSource(chunk: unknown): SearchSource | null {
  if (!chunk || typeof chunk !== "object") return null;
  const web = (chunk as { web?: unknown }).web;
  if (!web || typeof web !== "object") return null;
  const { title, uri } = web as { title?: unknown; uri?: unknown };
  const cleanUri = typeof uri === "string" ? uri.trim() : "";
  if (!parseUri(cleanUri)) return null;
  const domain = domainOf(cleanUri);
  const cleanTitle = typeof title === "string" && title.trim() ? title.trim() : domain;
  return { title: cleanTitle, uri: cleanUri, domain };
}

/**
 * Merge grounding chunks from several chunks into one de-duplicated,
 * display-ready list. First occurrence wins (Gemini lists chunk order).
 */
export function normalizeSources(chunks: unknown[]): SearchSource[] {
  const seen = new Set<string>();
  const sources: SearchSource[] = [];
  for (const chunk of chunks) {
    const source = normalizeSource(chunk);
    if (!source) continue;
    // De-duplicate by canonical location, so "www.x.com/a" and "x.com/a" are one source.
    let key = source.uri;
    try {
      const url = new URL(source.uri);
      url.hostname = url.hostname.replace(/^www\./, "");
      key = `${url.host}${url.pathname}${url.search}`;
    } catch {
      // keep the raw URI as the key
    }
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(source);
  }
  return sources;
}

/** Tidy the webSearchQueries list — keep the real strings, drop blanks, cap. */
export function normalizeQueries(queries: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries) {
    const text = typeof q === "string" ? q.trim() : "";
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= 6) break;
  }
  return out;
}
