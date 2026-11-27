/**
 * Feature flags + kill switches (backend hardening, Phase 5).
 *
 * Every major capability can be disabled at runtime by setting its env var to
 * "0" / "false" / "off" / "disabled" without a redeploy. This is the single
 * source of truth for capability availability — routes, the gateway and the UI
 * all read from here, so a kill switch is one env change away from disabling a
 * surface everywhere it runs.
 *
 * Flags default to ON unless explicitly disabled. Unknown values are treated
 * as ON (fail-open for availability, fail-closed for safety-critical gates
 * would require a different helper).
 */

const DISABLED = new Set(["0", "false", "off", "disabled", "no"]);

function envFlag(name: string, defaultValue = true): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return defaultValue;
  return !DISABLED.has(raw.trim().toLowerCase());
}

export const FEATURES = {
  /** Chat (the only surface open to guests). */
  chat: envFlag("ANVIK_FEATURE_CHAT", true),
  /** Deep web search (Google Search grounding + Exa/Tavily). */
  deepSearch: envFlag("ANVIK_FEATURE_DEEP_SEARCH", true),
  /** Code lab. */
  code: envFlag("ANVIK_FEATURE_CODE", true),
  /** Image generation studio. */
  image: envFlag("ANVIK_FEATURE_IMAGE", true),
  /** Vision / image analysis. */
  vision: envFlag("ANVIK_FEATURE_VISION", true),
  /** Voice input + voice mode. */
  voice: envFlag("ANVIK_FEATURE_VOICE", true),
  /** Account creation + sign-in. */
  auth: envFlag("ANVIK_FEATURE_AUTH", true),
  /** Long-term memory extraction (opt-in). */
  memory: envFlag("ANVIK_FEATURE_MEMORY", true),
  /** Web search auto-detection. */
  searchAuto: envFlag("ANVIK_FEATURE_SEARCH_AUTO", true),
} as const;

export type FeatureName = keyof typeof FEATURES;

/** True when a feature is currently enabled. */
export function featureEnabled(name: FeatureName): boolean {
  return FEATURES[name];
}

/** A ready-to-return 503 for a disabled feature. */
export function featureDisabledResponse(name: FeatureName): Response {
  return Response.json(
    {
      error: `${name} is temporarily disabled. Please try again shortly.`,
      code: "feature_disabled",
      feature: name,
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
