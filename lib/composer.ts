/**
 * Composer readiness rules.
 *
 * The composer must stay typable while identity is resolving — disabling the
 * textarea during session load was a P0 audit finding. Only *sending* waits for
 * a verified identity. These pure helpers keep the UI, the submit guard and the
 * tests on the same rule instead of scattering boolean chains through JSX.
 */

export type ComposerReadiness = {
  identityReady: boolean;
  sessionLoading: boolean;
  hasSession: boolean;
  hasProfile: boolean;
};

export type ComposerBlock = "preparing" | "verify_account" | null;

export const COMPOSER_NOTICE: Record<Exclude<ComposerBlock, null>, string> = {
  preparing: "Preparing your workspace… you can keep typing. Sending unlocks in a moment.",
  verify_account:
    "We couldn't verify your account. Your draft is safe — retry the connection to send.",
};

export const COMPOSER_ERROR: Record<Exclude<ComposerBlock, null>, string> = {
  preparing:
    "Your workspace is still loading. Your message is safe — try sending again in a moment.",
  verify_account:
    "We couldn't verify your account. Retry the connection below, then send again.",
};

export function composerBlockReason(readiness: ComposerReadiness): ComposerBlock {
  if (readiness.sessionLoading) return "preparing";
  if (readiness.hasSession && !readiness.hasProfile) return "verify_account";
  if (!readiness.identityReady) return "preparing";
  return null;
}

export function canSendMessage(
  readiness: ComposerReadiness,
  content: string,
  pending: boolean,
): boolean {
  return content.trim().length > 0 && !pending && composerBlockReason(readiness) === null;
}
