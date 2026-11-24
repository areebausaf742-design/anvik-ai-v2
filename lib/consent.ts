/**
 * Consent records — the server-side half of first-time onboarding.
 *
 * Consent is recorded per authenticated user, with the exact versions of the
 * Terms of Service and Privacy Policy the user accepted, the acceptance
 * timestamps, the AI-improvement consent state and any withdrawal — all in one
 * row per consent EVENT (one row per acceptance / withdrawal / re-enable),
 * plus the mirror fields on user_profiles for cheap reads. The browser never
 * writes these tables (RLS is off for the client); every request goes through
 * the server with the service role.
 *
 * State machine:
 *   - Exactly ONE row is ACTIVE at a time (no withdrawn_at). A change in AI
 *     improvement state closes the active row (withdrawn_at = now) and opens
 *     a new active row. A withdrawal inserts the withdrawal row as an
 *     event and leaves the active row closed.
 *   - hasAccepted derives from the ORIGINAL terms/privacy acceptance
 *     timestamps; withdrawal never erases them.
 *   - AI-improvement is active only when the active row has ai_improvement_consent
 *     = true. Declining it never blocks access and is recorded as-is.
 *
 * Honesty rules:
 *   - Never convert a declined choice into an accepted one.
 *   - Never invent acceptance timestamps — a new row carries the ORIGINAL
 *     acceptance timestamps and versions.
 *   - Duplicate submissions are deduped: an identical active state is a no-op.
 */

import {
  sbSelectDetailed,
  sbInsertDetailed,
  sbUpdateByIdDetailed,
  sbSelect,
  sbUpsert,
  type SbError,
} from "@/lib/supabase";

export const TERMS_VERSION = "2026-11";
export const PRIVACY_VERSION = "2026-11";

export type ConsentState = {
  hasAccepted: boolean;
  termsAcceptedAt: string | null;
  privacyAcceptedAt: string | null;
  aiImprovementConsent: boolean;
  aiImprovementConsentAt: string | null;
  withdrawnAt: string | null;
  agreementVersion: string | null;
  privacyVersion: string | null;
};

const EMPTY: ConsentState = {
  hasAccepted: false,
  termsAcceptedAt: null,
  privacyAcceptedAt: null,
  aiImprovementConsent: false,
  aiImprovementConsentAt: null,
  withdrawnAt: null,
  agreementVersion: null,
  privacyVersion: null,
};

/**
 * Thrown when the consent table cannot be read.
 *
 * Deliberately a distinct error instead of a falsy state: callers must render
 * "we could not check your consent" (retryable) rather than "you have not
 * accepted" (which invites a duplicate acceptance).
 */
export class ConsentReadError extends Error {
  constructor(readonly category: string) {
    super(`consent_unreadable:${category}`);
    this.name = "ConsentReadError";
  }
}

/** Sanitized, category-level diagnostic log — never identity, tokens or rows. */
export function consentLog(step: string, fields: Record<string, string>): void {
  try {
    const summary = Object.entries(fields)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ");
    // eslint-disable-next-line no-console
    console.info(`[anvik-consent] ${step} (${summary})`);
  } catch {
    /* diagnostics must never break the flow */
  }
}

function writeCategory(error: SbError | undefined): string {
  if (!error) return "unknown";
  const detail = error.detail ? `:${error.detail}` : "";
  return `${error.category}${detail}`;
}

export type ConsentWriteResult =
  | { ok: true; deduplicated?: boolean }
  | { ok: false; code: string; detail: string };

type ActiveConsentRow = {
  id: string;
  user_id: string;
  agreement_version: string;
  privacy_version: string;
  terms_accepted_at: string | null;
  privacy_accepted_at: string | null;
  ai_improvement_consent: boolean;
  ai_improvement_consent_at: string | null;
  withdrawn_at: string | null;
  created_at?: string;
};

async function readLatestRow(
  userId: string,
  reason: string,
): Promise<{ latest: ActiveConsentRow | null; failed: boolean }> {
  const res = await sbSelectDetailed<ActiveConsentRow>(
    "consent_records",
    `user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,agreement_version,privacy_version,terms_accepted_at,privacy_accepted_at,ai_improvement_consent,ai_improvement_consent_at,withdrawn_at,created_at&order=created_at.desc&limit=1`,
  );
  if (!res.ok) {
    consentLog(reason, { outcome: "read_failed", category: writeCategory(res.error) });
    return { latest: null, failed: true };
  }
  return { latest: res.rows[0] ?? null, failed: false };
}

async function readActiveRow(
  userId: string,
  reason: string,
): Promise<{ active: ActiveConsentRow | null; failed: boolean }> {
  const res = await sbSelectDetailed<ActiveConsentRow>(
    "consent_records",
    `user_id=eq.${encodeURIComponent(userId)}&withdrawn_at=is.null&select=id,user_id,agreement_version,privacy_version,terms_accepted_at,privacy_accepted_at,ai_improvement_consent,ai_improvement_consent_at,withdrawn_at,created_at&order=created_at.desc&limit=1`,
  );
  if (!res.ok) {
    consentLog(reason, { outcome: "read_failed", category: writeCategory(res.error) });
    return { active: null, failed: true };
  }
  return { active: res.rows[0] ?? null, failed: false };
}

/** Read the latest consent row for the user (server-side). */
export async function readConsent(userId: string): Promise<ConsentState> {
  if (!userId) return EMPTY;
  // Active row drives the current state; the latest row overall (active or
  // withdrawn) is used only for the acceptance timestamps (withdrawal
  // history must never erase them).
  const res = await sbSelectDetailed<Record<string, unknown>>(
    "consent_records",
    `user_id=eq.${encodeURIComponent(userId)}&select=agreement_version,privacy_version,terms_accepted_at,privacy_accepted_at,ai_improvement_consent,ai_improvement_consent_at,withdrawn_at,created_at&order=created_at.desc&limit=1`,
  );
  if (!res.ok) {
    // A database outage is NOT "this user never consented".
    //
    // The old code returned EMPTY here, so an unreachable Supabase made the UI
    // show the consent gate again to someone who had already accepted — and the
    // next POST re-recorded consent the user never gave. Callers must be able to
    // tell "no consent" apart from "could not read", so the failure is surfaced
    // as a distinct, throwable error.
    throw new ConsentReadError(res.error.category);
  }
  const latest = res.rows?.[0];
  if (!latest) return EMPTY;
  const termsAcceptedAt = typeof latest.terms_accepted_at === "string" ? latest.terms_accepted_at : null;
  const privacyAcceptedAt = typeof latest.privacy_accepted_at === "string" ? latest.privacy_accepted_at : null;
  const withdrawnAt = typeof latest.withdrawn_at === "string" ? latest.withdrawn_at : null;

  const activeRes = await sbSelectDetailed<Record<string, unknown>>(
    "consent_records",
    `user_id=eq.${encodeURIComponent(userId)}&withdrawn_at=is.null&select=ai_improvement_consent,ai_improvement_consent_at&order=created_at.desc&limit=1`,
  );
  const active = activeRes.ok ? activeRes.rows?.[0] : null;
  const aiActive = active?.ai_improvement_consent === true;
  return {
    hasAccepted: Boolean(termsAcceptedAt && privacyAcceptedAt),
    termsAcceptedAt,
    privacyAcceptedAt,
    aiImprovementConsent: aiActive,
    aiImprovementConsentAt: active && typeof active.ai_improvement_consent_at === "string" ? active.ai_improvement_consent_at : null,
    withdrawnAt,
    agreementVersion: typeof latest.agreement_version === "string" ? latest.agreement_version : null,
    privacyVersion: typeof latest.privacy_version === "string" ? latest.privacy_version : null,
  };
}

async function mirrorProfile(userId: string, patch: Record<string, unknown>, reason: string): Promise<void> {
  // Mirror onto the profile row (the profile route owns profile creation).
  // Never invent a profile — if none exists, the mirror is skipped and
  // consent_records remains the source of truth.
  try {
    const rows = await sbSelect<Record<string, unknown>>(
      "user_profiles",
      `user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`,
    );
    if (!rows || rows.length === 0) {
      consentLog(reason, { outcome: "skip_mirror_no_profile" });
      return;
    }
    const ok = await sbUpsert("user_profiles", [{ user_id: userId, updated_at: new Date().toISOString(), ...patch }], "user_id");
    if (!ok) consentLog(reason, { outcome: "mirror_failed" });
  } catch {
    consentLog(reason, { outcome: "mirror_failed" });
  }
}

async function closeActiveRow(row: ActiveConsentRow, now: string): Promise<boolean> {
  const patch = { withdrawn_at: now };
  const result = await sbUpdateByIdDetailed("consent_records", row.id, patch);
  if (!result.ok) {
    consentLog("close_active", { outcome: "update_failed", category: writeCategory(result.error) });
    return false;
  }
  return true;
}

/**
 * Record a full onboarding consent (terms + privacy, AI-improvement optional).
 * Idempotent: an active row already holding the identical state is a no-op.
 */
export async function recordConsent(
  userId: string,
  opts: { aiImprovementConsent: boolean },
): Promise<ConsentWriteResult> {
  if (!userId) return { ok: false, code: "missing_user", detail: "no user id provided" };
  const now = new Date().toISOString();
  const { active, failed } = await readActiveRow(userId, "record");
  if (failed) return { ok: false, code: "consent_read_failed", detail: "could not read existing consent" };

  // Identical active state — dedupe (safe to retry). The profile mirror still
  // runs so a retry after a partial failure completes the profile write.
  if (
    active &&
    active.agreement_version === TERMS_VERSION &&
    active.privacy_version === PRIVACY_VERSION &&
    active.ai_improvement_consent === opts.aiImprovementConsent
  ) {
    consentLog("record", { outcome: "deduplicated", ai_improvement: opts.aiImprovementConsent ? "true" : "false" });
    await mirrorProfile(userId, {
      terms_accepted_at: active.terms_accepted_at,
      privacy_accepted_at: active.privacy_accepted_at,
      ai_improvement_consent: opts.aiImprovementConsent,
      ai_improvement_consent_at: active.ai_improvement_consent_at,
      consent_withdrawal_at: null,
    }, "record");
    return { ok: true, deduplicated: true };
  }

  // Close the previously active row (the onboarding is a new consent event).
  if (active && !(await closeActiveRow(active, now))) {
    return { ok: false, code: "consent_close_failed", detail: "could not close previous active consent row" };
  }

  const row = {
    user_id: userId,
    agreement_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    terms_accepted_at: now,
    privacy_accepted_at: now,
    ai_improvement_consent: opts.aiImprovementConsent,
    ai_improvement_consent_at: opts.aiImprovementConsent ? now : null,
  };
  const insert = await sbInsertDetailed("consent_records", [row]);
  if (!insert.ok) {
    // A concurrent identical submission can both pass the dedupe check above;
    // the partial unique index on active rows then fails the loser with a
    // unique violation. The honest resolution: re-read the active row and, if
    // an identical winner exists, report a successful dedupe — a retried
    // double-submit must not surface a fake failure.
    if (insert.error.category === "unique_violation") {
      const { active: winner, failed: latestFailed } = await readActiveRow(userId, "record_unique_retry");
      if (
        !latestFailed &&
        winner &&
        winner.agreement_version === TERMS_VERSION &&
        winner.privacy_version === PRIVACY_VERSION &&
        winner.ai_improvement_consent === opts.aiImprovementConsent
      ) {
        consentLog("record", { outcome: "deduplicated", ai_improvement: opts.aiImprovementConsent ? "true" : "false" });
        await mirrorProfile(userId, {
          terms_accepted_at: winner.terms_accepted_at,
          privacy_accepted_at: winner.privacy_accepted_at,
          ai_improvement_consent: opts.aiImprovementConsent,
          ai_improvement_consent_at: winner.ai_improvement_consent_at,
          consent_withdrawal_at: null,
        }, "record");
        return { ok: true, deduplicated: true };
      }
    }
    consentLog("record", { outcome: "insert_failed", category: writeCategory(insert.error) });
    return { ok: false, code: "consent_insert_failed", detail: writeCategory(insert.error) };
  }

  await mirrorProfile(userId, {
    terms_accepted_at: now,
    privacy_accepted_at: now,
    ai_improvement_consent: opts.aiImprovementConsent,
    ai_improvement_consent_at: opts.aiImprovementConsent ? now : null,
    consent_withdrawal_at: null,
  }, "record");
  consentLog("record", { outcome: "recorded", ai_improvement: opts.aiImprovementConsent ? "true" : "false" });
  return { ok: true };
}

/**
 * Shared helper: withdrawal of an active AI-improvement consent. Closes the
 * active row, records an honest withdrawal event (original timestamps and
 * versions preserved) and mirrors the profile.
 */
async function withdrawActiveConsent(userId: string, reason: string): Promise<ConsentWriteResult> {
  const now = new Date().toISOString();
  const { active, failed } = await readActiveRow(userId, reason);
  if (failed) return { ok: false, code: "consent_read_failed", detail: "could not read existing consent" };
  if (!active) return { ok: false, code: "no_active_consent", detail: "no consent to withdraw" };
  if (active.ai_improvement_consent !== true) {
    consentLog(reason, { outcome: "not_applicable" });
    return { ok: true, deduplicated: true };
  }

  // Close the active row — the new state is "withdrawn".
  if (!(await closeActiveRow(active, now))) {
    return { ok: false, code: "consent_close_failed", detail: "could not close previous active consent row" };
  }

  const historyRow = {
    user_id: userId,
    agreement_version: typeof active.agreement_version === "string" ? active.agreement_version : TERMS_VERSION,
    privacy_version: typeof active.privacy_version === "string" ? active.privacy_version : PRIVACY_VERSION,
    terms_accepted_at: typeof active.terms_accepted_at === "string" ? active.terms_accepted_at : now,
    privacy_accepted_at: typeof active.privacy_accepted_at === "string" ? active.privacy_accepted_at : now,
    ai_improvement_consent: false,
    ai_improvement_consent_at: null,
    withdrawn_at: now,
  };
  const insert = await sbInsertDetailed("consent_records", [historyRow]);
  if (!insert.ok) {
    consentLog(reason, { outcome: "insert_failed", category: writeCategory(insert.error) });
    return { ok: false, code: "consent_insert_failed", detail: writeCategory(insert.error) };
  }

  await mirrorProfile(userId, {
    ai_improvement_consent: false,
    ai_improvement_consent_at: null,
    consent_withdrawal_at: now,
  }, reason);
  consentLog(reason, { outcome: "withdrawn" });
  return { ok: true };
}

/** Withdraw the AI-improvement consent. Returns success. */
export async function withdrawConsent(userId: string): Promise<ConsentWriteResult> {
  if (!userId) return { ok: false, code: "missing_user", detail: "no user id provided" };
  return withdrawActiveConsent(userId, "withdraw");
}

/** Update the AI-improvement consent state (enable/disable). */
export async function setAiImprovementConsent(userId: string, enabled: boolean): Promise<ConsentWriteResult> {
  if (!userId) return { ok: false, code: "missing_user", detail: "no user id provided" };
  const now = new Date().toISOString();

  const { latest, failed } = await readLatestRow(userId, "set_ai_improvement");
  if (failed) return { ok: false, code: "consent_read_failed", detail: "could not read existing consent" };
  if (!latest) return { ok: false, code: "no_active_consent", detail: "consent record not found" };
  const accepted = latest.terms_accepted_at != null && latest.privacy_accepted_at != null;
  if (!accepted) return { ok: false, code: "consent_required", detail: "terms and privacy acceptance required first" };

  if (!enabled) {
    // Declining is always allowed; if nothing was consented, it's a no-op.
    const { active } = await readActiveRow(userId, "set_ai_improvement");
    if ((active?.ai_improvement_consent ?? false) !== true) {
      consentLog("set_ai_improvement", { outcome: "deduplicated", ai_improvement: "false" });
      return { ok: true, deduplicated: true };
    }
    return withdrawActiveConsent(userId, "set_ai_improvement");
  }

  // enabled === true — already active and consented, no work needed.
  const { active } = await readActiveRow(userId, "set_ai_improvement");
  if (active && active.ai_improvement_consent === true) {
    consentLog("set_ai_improvement", { outcome: "deduplicated", ai_improvement: "true" });
    return { ok: true, deduplicated: true };
  }

  // Close the currently active row (may have been declined or older).
  if (active && !(await closeActiveRow(active, now))) {
    return { ok: false, code: "consent_close_failed", detail: "could not close previous active consent row" };
  }

  const row = {
    user_id: userId,
    agreement_version: typeof latest.agreement_version === "string" ? latest.agreement_version : TERMS_VERSION,
    privacy_version: typeof latest.privacy_version === "string" ? latest.privacy_version : PRIVACY_VERSION,
    terms_accepted_at: typeof latest.terms_accepted_at === "string" ? latest.terms_accepted_at : now,
    privacy_accepted_at: typeof latest.privacy_accepted_at === "string" ? latest.privacy_accepted_at : now,
    ai_improvement_consent: true,
    ai_improvement_consent_at: now,
    withdrawn_at: null,
  };
  const insert = await sbInsertDetailed("consent_records", [row]);
  if (!insert.ok) {
    consentLog("set_ai_improvement", { outcome: "insert_failed", category: writeCategory(insert.error) });
    return { ok: false, code: "consent_insert_failed", detail: writeCategory(insert.error) };
  }

  await mirrorProfile(userId, {
    ai_improvement_consent: true,
    ai_improvement_consent_at: now,
    consent_withdrawal_at: null,
  }, "set_ai_improvement");
  consentLog("set_ai_improvement", { outcome: "enabled" });
  return { ok: true };
}
