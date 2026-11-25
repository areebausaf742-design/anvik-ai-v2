export * from "./search";
import { normalizeSources } from "./search";

/** Build a freshness instruction carrying the live server UTC/IST time. */
export function buildSearchFreshnessInstruction(): string {
  const now = new Date();
  const utc = now.toISOString();
  const ist = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "long",
  }).format(now);
  return `Live grounding context: current server time is UTC ${utc} (IST ${ist}). When using web search, prioritize the most recent, dated, authoritative sources and never rely on stale training knowledge for time-sensitive facts.`;
}

export function extractSources(chunks: unknown[]) {
  return normalizeSources(chunks);
}

export function dedupeSources(chunks: unknown[]) {
  return normalizeSources(chunks);
}
