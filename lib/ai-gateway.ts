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
 *   1. take the already-resolved caller — a verified user, or a guest whose
 *      only identity is a salted hash of the platform-set IP (never a
 *      client-supplied device header)
 *   2. refuse a suspended or closed account
 *   3. validate the caller's own key, if one was supplied
 *   4. choose the key: user key wins, otherwise the server key
 *   5. distributed rate limit, keyed only by the verified user id
 *   6. reserve exactly one credit — but only when spending the server key
 *   7. hand back a `settle()` the route MUST call once, on every exit path
 *
 * A user-supplied key is never metered: the user is paying Google directly.
 *
 * Guests are a deliberate, narrow case:
 *
 *   - only the `chat` feature is open to them. Everything else is account-only
 *     (see `ACCOUNT_ONLY_FEATURES` in lib/guest-quota.ts) — those are the
 *     expensive, abuse-prone calls, and the product never promised them
 *     without an account.
 *   - they spend the server key against the ten-a-day guest allowance, counted
 *     per IST day and charged only after a successful answer.
 *   - they get no `chats` row: `userId` is null and routes must skip
 *     persistence, because a guest has no owner to file history under.
 */

import { serverKey } from "@/lib/provider";
import { allowDistributed, LIMIT_MESSAGE } from "@/lib/rate-limit";
import type { VerifiedUser } from "@/lib/session";
import {
  ACCOUNT_ONLY_FEATURES,
  GUEST_LIMIT,
  reserveGuestRequest,
  type AccountOnlyFeature,
} from "@/lib/guest-quota";
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
  /**
   * Verified Supabase user id, or `null` for a guest. Routes that persist rows
   * MUST treat `null` as "do not write": a guest has no owner, and the old code
   * that filed guest rows under a device id made them invisible to their own
   * author.
   */
  userId: string | null;
  /** True when this request is a guest spending the free daily allowance. */
  guest: boolean;
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

/** Who is spending: a verified account, or a guest. */
export type GatewayCaller = VerifiedUser | null;

const ACCOUNT_ONLY = new Set<string>(ACCOUNT_ONLY_FEATURES);

/** One error shape for "this surface needs an account", used by every route. */
function signInRequired(feature: AiFeature): GatewayResult {
  return {
    ok: false,
    response: jsonError(
      {
        error: `${FEATURE_LABEL[feature] ?? "This"} needs an account. Sign in to continue — it's free.`,
        code: "unauthenticated",
      },
      401,
    ),
  };
}

const FEATURE_LABEL: Record<string, string> = {
  image: "Image generation",
  code: "The code lab",
  voice: "Voice",
  vision: "Image analysis",
  chat: "Chat",
  ask: "Ask",
};

/**
 * Run the full guard chain for one AI request.
 *
 * Returns `{ ok: false, response }` with a ready-to-return error for any
 * refusal — the caller must return it unchanged so the UI keeps seeing one
 * error vocabulary across every surface.
 *
 * `caller` is `getVerifiedUserIfPresent(request)`: identity is resolved once, at
 * the very top of the route, before any request body is parsed. Pass `null` for
 * a guest. Guests are only accepted on features that are open to them; on every
 * other feature this refuses with `unauthenticated` BEFORE the body is read or a
 * provider is touched.
 */
export async function beginMeteredRequest(
  request: Request,
  feature: AiFeature,
  caller: GatewayCaller,
): Promise<GatewayResult> {
  const startedAt = Date.now();
  const limits = GATEWAY_LIMITS[feature];
  const reference = requestReference(request);
  const user = caller;

  // 1b. Guests: only the features the product actually promises without an
  //     account. Refusing here means a guest can never reach validation, rate
  //     limiting or a provider call on an account-only surface.
  if (!user && ACCOUNT_ONLY.has(feature)) return signInRequired(feature);

  // 2. Account standing. A suspended or closed account must not spend the
  //    server key, even with credits on the balance.
  if (user) {
    const standing = await readAccountStanding(user.id);
    if (!standing.allowed) {
      return { ok: false, response: accountBlockedResponse(standing) };
    }
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
    // Two different situations, two different answers.
    //
    // A signed-in user can act: they can connect their own Gemini key, so the
    // refusal is a 401 with that instruction.
    //
    // A guest cannot. "Connect your own key" is advice they have no way to
    // follow, and the real cause is our deployment — so they are told the truth
    // (the service is unavailable) with a 503, which is what it is.
    return user
      ? {
          ok: false,
          response: jsonError(
            { error: "ANVIK free key is not set. Connect your own key to continue.", code: "no_server_key" },
            401,
          ),
        }
      : {
          ok: false,
          response: jsonError(
            { error: "ANVIK is temporarily unavailable — please try again shortly.", code: "unavailable" },
            503,
          ),
        };
  }

  // 5. Distributed rate limit — keyed by the verified user id when we have one,
  //    otherwise by the platform-derived IP (`rateLimitIdentity` falls back to
  //    that). Never by a client-supplied identity header.
  const rate = await allowDistributed(request, feature, limits.perMinute, 0, {
    verifiedUserId: user?.id ?? null,
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

  // Own key → nothing to reserve, and nothing to settle. This applies to guests
  // too: they are paying Google directly, so they are not spending our quota
  // and there is nothing for us to meter.
  if (userKey) {
    return {
      ok: true,
      session: {
        key: userKey,
        userId: user?.id ?? null,
        guest: !user,
        metered: false,
        plan: "own_key",
        remaining: Number.POSITIVE_INFINITY,
        settle: async () => undefined,
      },
    };
  }

  // 6a. Guest allowance. A guest has no credit ledger, so they spend the ten
  //     free answers instead — reserved now, charged only after an answer.
  if (!user) {
    const guest = await reserveGuestRequest(request, "chat");
    if (!guest.ok) {
      logRouteEvent({
        route: feature,
        outcome: "error",
        status: 429,
        latencyMs: Date.now() - startedAt,
        errorCode: "guest_limit_reached",
      });
      return {
        ok: false,
        response: jsonError(
          {
            error: "You've used today's free questions. Sign in for more — it's free.",
            code: "guest_limit_reached",
            limit: GUEST_LIMIT,
            remaining: 0,
          },
          429,
          // So the UI can say exactly when the allowance comes back.
          { "X-ANVIK-Guest-Limit": String(GUEST_LIMIT) },
        ),
      };
    }
    return {
      ok: true,
      session: {
        key,
        userId: null,
        guest: true,
        metered: true,
        plan: "guest",
        remaining: guest.allowance.remaining,
        settle: async (outcome) => {
          // Charge only a completed answer; a failure or a client disconnect
          // must not consume one of ten free questions.
          if (outcome === "success") await guest.reserve();
          else guest.release();
        },
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
      guest: false,
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

/* ------------------------------------------------------------------ */
/* Smart multi-provider failover with jittered retry                    */
/* ------------------------------------------------------------------ */

export type FailoverOptions = {
  retries?: number;
  delaysMs?: number[];
  jitter?: boolean;
  shouldRetry?: (err: unknown) => boolean;
};

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { status?: number; code?: string; message?: string; name?: string };
  const status = anyErr.status;
  if (status === 429 || status === 500 || status === 502 || status === 503) return true;
  const code = String(anyErr.code ?? anyErr.name ?? "").toLowerCase();
  if (code.includes("timeout") || code.includes("abort") || code.includes("network")) return true;
  const msg = String(anyErr.message ?? err).toLowerCase();
  if (msg.includes("timeout") || msg.includes("network") || msg.includes("fetch failed")) return true;
  return false;
}

function jitter(ms: number): number {
  // +/- 25% jitter
  const delta = ms * 0.25;
  return Math.max(0, Math.round(ms + (Math.random() * 2 - 1) * delta));
}

export async function retryWithJitter<T>(
  fn: () => Promise<T>,
  options: FailoverOptions = {},
): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelays = options.delaysMs ?? [250, 500];
  const shouldRetry = options.shouldRetry ?? isRetryableError;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= retries || !shouldRetry(err)) throw err;
      const base = baseDelays[Math.min(attempt, baseDelays.length - 1)] ?? 250;
      const delay = options.jitter === false ? base : jitter(base);
      await sleepMs(delay);
    }
  }
  throw lastError;
}

export async function runWithFailover<T>(
  providers: Array<() => Promise<T>>,
  options: FailoverOptions = {},
): Promise<T> {
  let lastError: unknown;
  for (const provider of providers) {
    try {
      return await retryWithJitter(provider, options);
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  throw lastError ?? new Error("All providers failed");
}

export async function withFailover<T>(
  input: (() => Promise<T>) | Array<() => Promise<T>>,
  options: FailoverOptions = {},
): Promise<T> {
  if (Array.isArray(input)) return runWithFailover(input as Array<() => Promise<T>>, options);
  return retryWithJitter(input as () => Promise<T>, options);
}

export const failover = withFailover;
export const smartFailover = withFailover;
export const callWithFailover = withFailover;
export const retryWithBackoff = retryWithJitter;
export function jitteredDelay(baseMs: number): number {
  return jitter(baseMs);
}
