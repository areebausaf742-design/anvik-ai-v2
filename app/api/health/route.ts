/**
 * /api/health — liveness probe.
 *
 * Cheap, keyless, and answers without touching Gemini or Supabase so a
 * deployment can be checked even in an outage. Stays the same shape forever:
 *   { "status": "ok", "model": "gemini-2.5-flash" }
 */

import { MODEL_FALLBACK_CHAIN } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    model: MODEL_FALLBACK_CHAIN[0],
  });
}
