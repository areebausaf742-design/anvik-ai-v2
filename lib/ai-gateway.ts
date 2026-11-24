/**
 * The single metered entrance to every paid AI surface.
 *
 * Before this module each AI route re-implemented its own guard chain, and the
 * chains disagreed:
 *
 *   /api/chat    identity → rate limit → credit reservation → Gemini
 *   /api/ask     identity → rate limit → Gemini           (no credit)
 *   /api/code    identity → rate limit → Gemini           (no credit)
 *   /api/voice   identity → rate limit → Gemini           (no credit)
 *   /api/vision  identity → rate limit → Gemini           (no credit)
 *   /api/image   identity → rate limit → Gemini           (no credit)
 *
 * That meant a user with an exhausted allowance could keep spending the
 * server's Gemini key through five of the six routes — the free tier was a
 * suggestion, not a limit. Every route now calls `beginMeteredRequest`, which
 * applies, in this order and with no shortcuts:
 *
 *   1. take the already-verified user (each route calls `requireUser` first,
 *      so an unauthenticated guest is refused before the body is even parsed)
 *   2. refuse a suspended or closed account
 *   3. validate the caller's own key, if one was supplied
 *   4. choose the key: user key wins, otherwise the server key
 *   5. distributed rate limit, keyed only by the verified user id
 *   6. reserve exactly one credit — but only when spending the server key
 *   7. hand back a `settle()` the route MUST call once, on every exit path
 *
 * A user-supplied key is never metered: the user is paying Google directly.
 */

import { serverKey } from "@/lib/provider";
import { allowDistributed, LIMIT_MESSAGE } from "@/lib/rate-limit";
import type { VerifiedUser } from "@/lib/session";
import { isValidGeminiKeyFormat, KEY_FORMAT_ERROR } from "@/lib/gemini";
import { ensureEntitlement, effectivePlan, reserveCredit, settleCredit } from "@/lib/credits";
import { planById } from "@/lib/plans";
import { logRouteEvent } from "@/lib/observability";
import { accountBlockedResponse, readAccountStanding } from "@/lib/account-status";

/** Per-route rate limits. Feature names are stable: they are written to
 *  `usage_events.feature_used`, so changing one breaks billing history. */
export const GATEWAY_LIMITS = {
  chat: { perMinute: 60, spacingMs: 2_000 },
  ask: { perMinute: 12, spacingMs: 0 },
  code: { perMinute: 12, spacingMs: 0 },
  voice: { perMinute: 12, spacingMs: 0 },
  vision: { perMinute: 10, spacingMs: 0 },
  image: { perMinute: 6, spacingMs: 0 },
} as const;

export type AiFeature = keyof typeof GATEWAY_LIMITS;

export type SettleOutcome = "success" | "failure" | "aborted";

export type MeteredSession = {
  /** The Gemini key to use. */
  key: string;
  /** Verified Supabase user id — always present for metered routes. */
  userId: string;
  /** True when the server key is being spent and a credit was reserved. */
  metered: boolean;
  /** Plan the request was billed under ("free" | "pack" | "daily" | "yearly"). */
  plan: string;
  /** Remaining credits reported by the reservation, for response headers. */
  remaining: number;
  /**
   * Close the reservation. Call exactly once per request on EVERY exit path.
   * Idempotent in-process and in the database (`settle_credit` is keyed by
   * reference), so a double call is harmless but a missing call costs the
   * user a credit — the sweeper only returns it after 15 minutes.
   */
  settle: (outcome: SettleOutcome, detail?: { model?: string | null; inputTokens?: number | null; outputTokens?: number | null }) => Promise<void>;
};

export type GatewayResult = { ok: true; session: MeteredSession } | { ok: false; response: Response };

const jsonError = (body: unknown, status: number, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...(headers ?? {}) },
  });

function requestReference(request: Request): string {
  const supplied = (request.headers.get("x-anvik-request-id") ?? "").trim().slice(0, 160);
  return supplied || crypto.randomUUID();
}

/**
 * Run the full guard chain for one AI request.
 *
 * Returns `{ ok: false, response }` with a ready-to-return error for any
 * refusal — the caller must return it unchanged so the UI keeps seeing one
 * error vocabulary across every surface.
 *
 * `user` must come from `requireUser(request)` in the calling route: identity
 * is verified once, at the very top of the route, before any request body is
 * parsed. Guests therefore never reach validation, rate limiting, or a
 * provider call.
 */
export async function beginMeteredRequest(
  request: Request,
  feature: AiFeature,
  user: VerifiedUser,
): Promise<GatewayResult> {
  const startedAt = Date.now();
  const limits = GATEWAY_LIMITS[feature];
  const reference = requestReference(request);

  // 2. Account standing. A suspended or closed account must not spend the
  //    server key, even with credits on the balance.
  const standing = await readAccountStanding(user.id);
  if (!standing.allowed) {
    return { ok: false, response: accountBlockedResponse(standing) };
  }

  // 3. The caller's own key, if any, must look like a Gemini key.
  const supplied = request.headers.get("x-google-generative-ai-api-key")?.trim();
  if (supplied && !isValidGeminiKeyFormat(supplied)) {
    return { ok: false, response: jsonError({ error: KEY_FORMAT_ERROR, code: "bad_format" }, 400) };
  }
  const userKey = supplied && isValidGeminiKeyFormat(supplied) ? supplied : undefined;

  // 4. Key choice. A user key is unlimited by design (the user pays Google).
  const key = userKey ?? serverKey();
  if (!key) {
    return {
      ok: false,
      response: jsonError(
        { error: "ANVIK free key is not set. Connect your own key to continue.", code: "no_server_key" },
        401,
      ),
    };
  }

  // 5. Distributed rate limit — keyed only by the verified user id, never by a
  //    client-supplied identity header.
  const rate = await allowDistributed(request, feature, limits.perMinute, 0, {
    verifiedUserId: user.id,
    spacingMs: limits.spacingMs,
  });
  if (!rate.allowed) {
    const retryAfter = Math.max(1, Math.ceil(rate.retryAfterMs / 1000));
    logRouteEvent({
      route: feature,
      outcome: "rate_limited",
      status: 429,
      latencyMs: Date.now() - startedAt,
      rateLimitSource: rate.source,
      errorCode: "rate_limit",
    });
    return {
      ok: false,
      response: jsonError({ error: LIMIT_MESSAGE, code: "rate_limit" }, 429, {
        "Retry-After": String(retryAfter),
      }),
    };
  }

  // Own key → nothing to reserve, and nothing to settle.
  if (userKey) {
    return {
      ok: true,
      session: {
        key: userKey,
        userId: user.id,
        metered: false,
        plan: "own_key",
        remaining: Number.POSITIVE_INFINITY,
        settle: async () => undefined,
      },
    };
  }

  // 6. One credit, reserved atomically before the model is called.
  const entitlement = await ensureEntitlement(user.id).catch(() => null);
  const effective = effectivePlan(entitlement);
  const reserved = await reserveCredit(user.id, effective.limit, reference);

  if (!reserved.ok) {
    const duplicate = reserved.reason === "duplicate_request";
    const code = duplicate
      ? "duplicate_request"
      : effective.plan === "free"
        ? "free_limit_reached"
        : "plan_limit_reached";
    logRouteEvent({
      route: feature,
      outcome: "error",
      status: 429,
      latencyMs: Date.now() - startedAt,
      errorCode: code,
    });
    return {
      ok: false,
      response: jsonError(
        {
          error: duplicate
            ? "This request was already answered. Ask again to continue."
            : "You've reached your allowance. Connect your own key for unlimited, or upgrade at ANVIK pricing.",
          code,
          plan: effective.plan,
          remaining: 0,
        },
        429,
      ),
    };
  }

  const spec = planById(effective.plan);

  let settled = false;
  return {
    ok: true,
    session: {
      key,
      userId: user.id,
      metered: true,
      plan: effective.active && spec.priceInr > 0 ? spec.id : effective.plan,
      remaining: reserved.remaining,
      settle: async (outcome, detail) => {
        if (settled) return;
        settled = true;
        // Never throws: an unreachable database must not break the response.
        const result = await settleCredit({
          userId: user.id,
          reference,
          outcome,
          model: detail?.model ?? null,
          feature,
          inputTokens: detail?.inputTokens ?? null,
          outputTokens: detail?.outputTokens ?? null,
        });
        if (!result.ok) {
          // The sweeper will refund this within 15 minutes.
          logRouteEvent({
            route: feature,
            outcome: "error",
            status: 0,
            latencyMs: Date.now() - startedAt,
            errorCode: "settle_deferred",
          });
        }
      },
    },
  };
}

/**
 * Wrap a provider stream so the reservation is settled exactly once, whatever
 * happens: full read → success, provider error mid-stream → failure, client
 * disconnect → aborted (the credit is returned).
 */
export function meteredStream(
  upstream: ReadableStream<Uint8Array>,
  settle: MeteredSession["settle"],
  options: { model?: string | null } = {},
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  let finished = false;

  const finish = async (outcome: SettleOutcome) => {
    if (finished) return;
    finished = true;
    await settle(outcome, { model: options.model ?? null });
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          await finish("success");
          return;
        }
        if (value) controller.enqueue(value);
      } catch (error) {
        controller.error(error);
        await finish("failure");
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } catch {
        /* upstream already gone */
      }
      await finish("aborted");
    },
  });
}
