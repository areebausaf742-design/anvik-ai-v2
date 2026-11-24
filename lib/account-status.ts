/**
 * Account standing — the enforcement half of `user_profiles.account_status`.
 *
 * The column existed, was written as `"active"` on every profile creation, and
 * was read only to be echoed back to the browser in `/api/auth/me`. Nothing
 * ever *checked* it, so a suspended or deleted account kept full access to the
 * server key, its credits, and its history. Status was decoration.
 *
 * Rules enforced here:
 *   active     → allowed
 *   suspended  → refused (403), credits untouched, data preserved
 *   deleted    → refused (403), data preserved (deletion is an operator action)
 *
 * Anything unrecognised is treated as `active`. That is deliberate: a typo in
 * an operator's SQL must not lock real users out, and an unknown value is not
 * evidence of abuse. The dangerous direction was the opposite one — treating a
 * *known* blocked status as allowed — and that is now impossible.
 *
 * Fail policy: if the profile cannot be read (Supabase outage) the user is
 * ALLOWED through. Blocking every request during a database wobble would be a
 * self-inflicted outage, and `/api/chat` already fails closed on the credit
 * reservation it needs anyway.
 */

import { sbSelect } from "@/lib/supabase";

export type AccountStatus = "active" | "suspended" | "deleted";

const BLOCKED: ReadonlySet<string> = new Set(["suspended", "deleted"]);

export function normalizeAccountStatus(raw: unknown): AccountStatus {
  if (raw === "suspended") return "suspended";
  if (raw === "deleted") return "deleted";
  return "active";
}

export function isBlockedStatus(status: AccountStatus): boolean {
  return BLOCKED.has(status);
}

export type AccountStanding =
  | { allowed: true; status: AccountStatus }
  | { allowed: false; status: AccountStatus; message: string };

/**
 * Read the caller's account standing. Never throws; an unreadable profile is
 * treated as active (see the fail policy above).
 */
export async function readAccountStanding(userId: string): Promise<AccountStanding> {
  if (!userId) return { allowed: true, status: "active" };
  const rows = await sbSelect<{ account_status?: string | null }>(
    "user_profiles",
    `user_id=eq.${encodeURIComponent(userId)}&select=account_status&limit=1`,
  ).catch(() => null);

  // No profile yet is normal (first request after signup) — not a block.
  const status = normalizeAccountStatus(rows?.[0]?.account_status);
  if (!isBlockedStatus(status)) return { allowed: true, status };

  return {
    allowed: false,
    status,
    message:
      status === "deleted"
        ? "This account has been closed. Contact support if you believe this is a mistake."
        : "This account is suspended. Contact support to restore access.",
  };
}

/** The ready-to-return 403 for a blocked account. */
export function accountBlockedResponse(standing: Extract<AccountStanding, { allowed: false }>): Response {
  return Response.json(
    { error: standing.message, detail: standing.message, code: "account_" + standing.status },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
