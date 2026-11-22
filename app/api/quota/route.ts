/**
 * /api/quota — free-tier status, computed server-side and persisted in the
 * Supabase `quota_usage` table (per IP hash + IST day). Not localStorage.
 *
 * The client calls this before sending a message; the chat route re-checks
 * the same quota server-side and counts it only after a successful stream.
 *
 * Response (locked contract — the chat UI reads hasServerKey/status/remaining):
 *   { "hasServerKey": true, "status": "ok", "remaining": X,
 *     "googleStatus": 200, "modelUsed": "gemini-2.5-flash", "limit": 20 }
 */

import { MODEL_FALLBACK_CHAIN, validateGeminiServerKey } from "@/lib/gemini";
import { serverKey } from "@/lib/provider";
import { QuotaStore, supabaseQuotaHooks, FREE_LIMIT } from "@/lib/quota";
import { sbSelect, sbUpsert } from "@/lib/supabase";
import { hashIp } from "@/lib/security";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const quota = new QuotaStore(supabaseQuotaHooks(sbSelect, sbUpsert));

export async function GET(request: Request) {
  const ipHash = hashIp(clientIp(request));
  const configuredKey = serverKey();
  const hasServerKey = Boolean(configuredKey);

  // Only ever "invalid" when Google explicitly says the key is not valid.
  const validation = configuredKey
    ? await validateGeminiServerKey(configuredKey)
    : { googleStatus: null, invalid: false };

  // Remaining may be briefly cached for display only (never answers — quota
  // counts are the one cache this product is allowed).
  const remaining = hasServerKey ? await quota.remaining(ipHash) : FREE_LIMIT;

  const status = !hasServerKey
    ? "not_configured"
    : validation.invalid
      ? "invalid_server_key"
      : remaining <= 0
        ? "limit_reached"
        : "ok";

  return Response.json({
    hasServerKey,
    status,
    remaining: Math.max(0, remaining),
    googleStatus: validation.googleStatus,
    modelUsed: MODEL_FALLBACK_CHAIN[0],
    limit: FREE_LIMIT,
  });
}
