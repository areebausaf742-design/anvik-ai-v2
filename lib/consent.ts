/**
 * Consent records — the server-side half of first-time onboarding.
 *
 * Consent is recorded per authenticated user, with the exact versions of the
 * Terms of Service and Privacy Policy the user accepted, the acceptance
 * timestamps, the AI-improvement consent state and any withdrawal — all in
 * one row (plus the mirror fields on user_profiles for cheap reads). The
 * browser never writes these tables (RLS is off for the client); every
 * request goes through the server with the service role.
 */

import { sbInsert, sbSelect, sbUpsert } from "@/lib/supabase";

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

/** Read the latest consent row for the user (server-side). */
export async function readConsent(userId: string): Promise<ConsentState> {
  if (!userId) return EMPTY;
  const rows = await sbSelect<Record<string, unknown>>(
    "consent_records",
    `user_id=eq.${encodeURIComponent(userId)}&select=agreement_version,privacy_version,terms_accepted_at,privacy_accepted_at,ai_improvement_consent,ai_improvement_consent_at,withdrawn_at,created_at&order=created_at.desc&limit=1`,
  );
  const row = rows?.[0];
  if (!row) return EMPTY;
  const termsAcceptedAt = typeof row.terms_accepted_at === "string" ? row.terms_accepted_at : null;
  const privacyAcceptedAt = typeof row.privacy_accepted_at === "string" ? row.privacy_accepted_at : null;
  const withdrawnAt = typeof row.withdrawn_at === "string" ? row.withdrawn_at : null;
  return {
    hasAccepted: Boolean(termsAcceptedAt && privacyAcceptedAt),
    termsAcceptedAt,
    privacyAcceptedAt,
    aiImprovementConsent: row.ai_improvement_consent === true ? !withdrawnAt : false,
    aiImprovementConsentAt: typeof row.ai_improvement_consent_at === "string" ? row.ai_improvement_consent_at : null,
    withdrawnAt,
    agreementVersion: typeof row.agreement_version === "string" ? row.agreement_version : null,
    privacyVersion: typeof row.privacy_version === "string" ? row.privacy_version : null,
  };
}

/** Record a full onboarding consent (terms + privacy). Returns success. */
export async function recordConsent(
  userId: string,
  opts: { aiImprovementConsent: boolean },
): Promise<boolean> {
  if (!userId) return false;
  const now = new Date().toISOString();
  const consentRow = {
    user_id: userId,
    agreement_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    terms_accepted_at: now,
    privacy_accepted_at: now,
    ai_improvement_consent: opts.aiImprovementConsent,
    ai_improvement_consent_at: opts.aiImprovementConsent ? now : null,
  };
  const inserted = await sbInsert("consent_records", [consentRow]);
  // Mirror onto the profile row when it exists (the profile route owns
  // profile creation). Never invent a profile here.
  const existing = await sbSelect<Record<string, unknown>>(
    "user_profiles",
    `user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`,
  );
  let profileOk = true;
  if (existing && existing.length > 0) {
    profileOk = await sbUpsert("user_profiles", [
      {
        user_id: userId,
        terms_accepted_at: now,
        privacy_accepted_at: now,
        ai_improvement_consent: opts.aiImprovementConsent,
        ai_improvement_consent_at: opts.aiImprovementConsent ? now : null,
        consent_withdrawal_at: null,
        updated_at: now,
      },
    ]);
  }
  return inserted && profileOk;
}

/** Withdraw the AI-improvement consent. Returns success. */
export async function withdrawConsent(userId: string): Promise<boolean> {
  if (!userId) return false;
  const now = new Date().toISOString();
  const existing = await sbSelect<Record<string, unknown>>(
    "user_profiles",
    `user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`,
  );
  let ok = true;
  if (existing && existing.length > 0) {
    ok = await sbUpsert("user_profiles", [
      {
        user_id: userId,
        ai_improvement_consent: false,
        ai_improvement_consent_at: null,
        consent_withdrawal_at: now,
        updated_at: now,
      },
    ]);
  }
  const consentOk = await sbInsert("consent_records", [
    {
      user_id: userId,
      agreement_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      terms_accepted_at: now,
      privacy_accepted_at: now,
      ai_improvement_consent: false,
      withdrawn_at: now,
    },
  ]);
  return ok && consentOk;
}

/** Update the AI-improvement consent state (enable/disable). */
export async function setAiImprovementConsent(userId: string, enabled: boolean): Promise<boolean> {
  if (!userId) return false;
  const now = new Date().toISOString();
  const existing = await sbSelect<Record<string, unknown>>(
    "user_profiles",
    `user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`,
  );
  let ok = true;
  if (existing && existing.length > 0) {
    ok = await sbUpsert("user_profiles", [
      {
        user_id: userId,
        ai_improvement_consent: enabled,
        ai_improvement_consent_at: enabled ? now : null,
        consent_withdrawal_at: enabled ? null : now,
        updated_at: now,
      },
    ]);
  }
  const consentOk = await sbInsert("consent_records", [
    {
      user_id: userId,
      agreement_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      terms_accepted_at: now,
      privacy_accepted_at: now,
      ai_improvement_consent: enabled,
      ai_improvement_consent_at: enabled ? now : null,
      withdrawn_at: enabled ? null : now,
    },
  ]);
  return ok && consentOk;
}
