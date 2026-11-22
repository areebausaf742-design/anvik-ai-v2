/**
 * Cost ceilings and Flash model allowlist — and nothing that answers a question.
 */

export const ALLOWED_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];
export const CHAT_MAX_TOKENS = 2048;
export const CODE_MAX_TOKENS = 2048;
export const PAID_MAX_TOKENS = 4096;
export const MAX_TEMPERATURE = 0.85;

export function isAllowedModel(model: string): boolean {
  return ALLOWED_MODELS.includes(model.trim().toLowerCase());
}
