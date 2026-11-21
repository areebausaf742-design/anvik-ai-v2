/**
 * Cost ceilings and Flash model allowlist — and nothing that answers a question.
 */

export const ALLOWED_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-1.5-flash",
];
export const CHAT_MAX_TOKENS = 1200;
export const CODE_MAX_TOKENS = 2048;
export const MAX_TEMPERATURE = 0.85;
export const SOFT_DAILY_LIMIT = 100;

export function isAllowedModel(model: string): boolean {
  return ALLOWED_MODELS.includes(model.trim().toLowerCase());
}

export const LIMIT_REACHED =
  `You've reached ${SOFT_DAILY_LIMIT} answers today on this device. Every answer costs a model call now, so the limit resets at midnight IST.`;
