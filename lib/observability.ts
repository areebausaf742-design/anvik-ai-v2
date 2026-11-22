/**
 * Privacy-conscious structured logging — the single contract for AI-route
 * observability on ANVIK.
 *
 * Every event is emitted as ONE single-line JSON object on stdout. Any log
 * pipeline (Vercel Log Drains / Datadog intake / Logpush) can parse it with
 * zero additional schema work. Nothing in the payload may carry user content,
 * keys, messages or names — only non-sensitive shape data (route, status,
 * latency, outcome). A human never reads the payloads; they exist to be
 * aggregated.
 *
 * Datadog itself is not coupled to this module: indexing is configured
 * dashboard-side (Vercel → Observability / Integrations → Datadog, and the
 * intake index). This module emits the events a Datadog pipeline could index;
 * it does not talk to Datadog directly.
 */

export type RouteOutcome = "success" | "rate_limited" | "not_configured" | "invalid" | "error";

export type RouteEvent = {
  route: string;
  outcome: RouteOutcome;
  status: number;
  latencyMs: number;
  /** Model actually used — only for successful AI routes. Never a key. */
  model?: string;
  /** "distributed" | "memory" — the rate limiter that decided. */
  rateLimitSource?: string;
  /** Short, non-content error code — e.g. "bad_format", "rate_limit". */
  errorCode?: string;
};

/** Emit one structured event. Never throws. */
export function logRouteEvent(event: RouteEvent): void {
  try {
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      service: "anvik-ai-v2",
      route: event.route,
      outcome: event.outcome,
      status: event.status,
      latencyMs: Math.max(0, Math.round(event.latencyMs)),
    };
    if (event.model) entry.model = event.model;
    if (event.rateLimitSource) entry.rateLimitSource = event.rateLimitSource;
    if (event.errorCode) entry.errorCode = event.errorCode;
    console.log(JSON.stringify(entry));
  } catch {
    /* logging must never break the route */
  }
}
