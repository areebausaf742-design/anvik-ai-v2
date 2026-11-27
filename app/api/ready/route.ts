/**
 * /api/ready — readiness probe.
 *
 * Unlike /api/health (which only reports configuration), this route verifies
 * that the dependencies the app actually needs are reachable, with short
 * timeouts so a slow upstream cannot make the probe itself hang. Returns 200
 * when ready, 503 when a dependency is down — suitable for load balancers and
 * deployment gates.
 *
 * Checks:
 *   - Supabase: a HEAD/GET against the REST endpoint (only when configured)
 *   - Gemini: a GET against the models endpoint with the server key (only when configured)
 *
 * Each check is capped at 3 seconds. A missing dependency is reported as
 * "not_configured" and does NOT fail readiness — the app degrades gracefully.
 */

import { serverKey } from "@/lib/provider";
import { supabaseEnabled } from "@/lib/supabase";
import { authConfigured } from "@/lib/session";
import { getGeminiBaseUrl } from "@/lib/gemini";

const TIMEOUT_MS = 3000;

async function checkSupabase(): Promise<{ ok: boolean; status: string }> {
  if (!supabaseEnabled()) return { ok: true, status: "not_configured" };
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  if (!url) return { ok: true, status: "not_configured" };
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      method: "HEAD",
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: res.ok || res.status === 404 || res.status === 405, status: res.ok ? "ok" : `http_${res.status}` };
  } catch (err) {
    return { ok: false, status: err instanceof Error ? err.name : "error" };
  }
}

async function checkGemini(): Promise<{ ok: boolean; status: string }> {
  const key = serverKey();
  if (!key) return { ok: true, status: "not_configured" };
  try {
    const res = await fetch(`${getGeminiBaseUrl()}/models?key=${encodeURIComponent(key.trim())}`, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: res.ok || res.status === 400, status: res.ok ? "ok" : `http_${res.status}` };
  } catch (err) {
    return { ok: false, status: err instanceof Error ? err.name : "error" };
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const [supabase, gemini] = await Promise.all([checkSupabase(), checkGemini()]);

  const ready = supabase.ok && gemini.ok;
  return Response.json(
    {
      status: ready ? "ready" : "not_ready",
      checks: {
        supabase,
        gemini,
        auth: { ok: true, status: authConfigured() ? "configured" : "not_configured" },
      },
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
