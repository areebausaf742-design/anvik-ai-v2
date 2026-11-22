/**
 * GET /api/credits — the caller's per-user credit state + history, computed
 * server-side. Never trusts client-supplied amounts, plans or usage.
 */

import { requireUser } from "@/lib/session";
import { readCredits, readUsageHistory, readLedger } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const credits = await readCredits(user.id);
  const usage = await readUsageHistory(user.id, 12);
  const ledger = await readLedger(user.id, 12);

  return Response.json(
    {
      credits,
      usage: usage.map((u) => ({
        id: u.id,
        model: u.model,
        feature: u.feature_used,
        status: u.request_status,
        credits: u.credits_consumed,
        createdAt: u.created_at,
      })),
      ledger: ledger.map((l) => ({
        id: l.id,
        type: l.transaction_type,
        amount: l.credit_amount,
        description: l.description,
        createdAt: l.created_at,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
