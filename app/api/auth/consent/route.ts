/**
 * /api/auth/consent — first-time onboarding consent + settings management.
 *
 * POST — record (or update) the user's consent state:
 *   { termsAccepted: true, privacyAccepted: true, aiImprovementConsent: boolean }
 *   { action: "withdraw_ai_improvement" }
 *   { action: "set_ai_improvement", enabled: boolean }
 * GET — the current consent state for the caller.
 *
 * Never trusts client-supplied versions or identities — versions come from
 * the server constants; the user is the verified bearer token.
 *
 * Failures are returned as user-safe messages; the exact failure category
 * (missing table, RLS denial, timeout, duplicate key) is only ever logged
 * server-side.
 */

import { requireUser } from "@/lib/session";
import {
  readConsent,
  recordConsent,
  withdrawConsent,
  setAiImprovementConsent,
  consentLog,
  TERMS_VERSION,
  PRIVACY_VERSION,
} from "@/lib/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const { user } = auth;
  try {
    const consent = await readConsent(user.id);
    return json({
      consent: {
        ...consent,
        agreementVersion: consent.agreementVersion ?? TERMS_VERSION,
        privacyVersion: consent.privacyVersion ?? PRIVACY_VERSION,
      },
      versions: { terms: TERMS_VERSION, privacy: PRIVACY_VERSION },
    });
  } catch (e) {
    consentLog("read", { outcome: "read_error" });
    return json({ error: "Could not load your consent state.", code: "consent_read_failed" }, 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send a valid JSON body.", code: "bad_body" }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ error: "Send a valid JSON body.", code: "bad_body" }, 400);
  }
  const payload = body as Record<string, unknown>;
  const action = typeof payload.action === "string" ? payload.action : "record";

  if (action === "withdraw_ai_improvement") {
    const result = await withdrawConsent(user.id);
    if (!result.ok) {
      return json({ error: "Could not record your withdrawal. Please try again.", code: "consent_failed" }, 500);
    }
    return json({ ok: true, action: "withdraw_ai_improvement" });
  }

  if (action === "set_ai_improvement") {
    const enabled = payload.enabled === true;
    const result = await setAiImprovementConsent(user.id, enabled);
    if (!result.ok) {
      const message =
        result.code === "consent_required"
          ? "Accept the Terms of Service and Privacy Policy first."
          : "Could not update your AI-improvement consent. Please try again.";
      return json({ error: message, code: "consent_failed" }, 500);
    }
    return json({ ok: true, action: "set_ai_improvement", enabled });
  }

  // record — the onboarding path. Terms and privacy acceptance are both
  // required; AI-improvement consent is optional and never preselected.
  const termsAccepted = payload.termsAccepted === true;
  const privacyAccepted = payload.privacyAccepted === true;
  if (!termsAccepted || !privacyAccepted) {
    return json(
      { error: "Terms of Service and Privacy Policy must be accepted before continuing.", code: "consent_required" },
      400,
    );
  }
  // The optional AI-improvement choice is strictly an explicit opt-in — an
  // absent or falsy value is treated as declined, never as accepted.
  const aiImprovementConsent = payload.aiImprovementConsent === true;

  const result = await recordConsent(user.id, { aiImprovementConsent });
  if (!result.ok) {
    return json({ error: "Could not save your consent. Please try again.", code: "consent_failed" }, 500);
  }

  return json({
    ok: true,
    action: "record",
    aiImprovementConsent,
    deduplicated: result.deduplicated === true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
  });
}
