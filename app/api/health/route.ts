/**
 * /api/health — liveness probe.
 *
 * Cheap, keyless and outbound-free: never touches Gemini, Supabase or any
 * upstream service on the request path, so a deployment can be checked in
 * seconds and an outage cannot make the probe itself time out. The response
 * reports which integrations are CONFIGURED (not whether they are reachable) —
 * an honest "what is wired up" signal without leaking secrets and without the
 * latency of a live dependency check.
 *
 * Shape (existing consumers):
 *   { status: "ok", model: "gemini-2.5-flash", configured: { supabase, serverKey, auth } }
 */

import { MODEL_FALLBACK_CHAIN } from "@/lib/gemini";
import { serverKey } from "@/lib/provider";
import { supabaseEnabled } from "@/lib/supabase";
import { authConfigured } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      status: "ok",
      model: MODEL_FALLBACK_CHAIN[0],
      configured: {
        supabase: supabaseEnabled(),
        serverKey: Boolean(serverKey()),
        auth: authConfigured(),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
