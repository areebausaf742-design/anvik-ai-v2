/**
 * Client-side Gemini key & daily device identity storage.
 *
 * Key rules:
 *  - Must start with "AIza" or "AQ" and be at least 35 characters.
 *  - Stored in localStorage under a single key ("anvik-gemini-api-key").
 *
 * Daily quota is NOT tracked client-side — the server is authoritative
 * (lib/quota.ts for Free, lib/entitlements.ts for paid plans). This module
 * never records, reports or reserves quota.
 */

export const API_KEY_STORAGE = "anvik-gemini-api-key";
export const DEVICE_STORAGE = "anvik-device-id";

export const KEY_FORMAT_MESSAGE = "That key doesn't look right. Check its format or replace it in Settings.";

export function isValidGeminiKey(value: string | undefined | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  // Both legacy AIza keys and the newer AQ keys are valid Google keys.
  return (trimmed.startsWith("AIza") || trimmed.startsWith("AQ")) && trimmed.length >= 35;
}

export function readRawApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function readApiKey(): string {
  const value = readRawApiKey();
  return isValidGeminiKey(value) ? value : "";
}

export function hasApiKey(): boolean {
  return readApiKey().length > 0;
}

export function saveApiKey(value: string): void {
  try {
    localStorage.setItem(API_KEY_STORAGE, value.trim());
  } catch {
    /* private mode: the key simply is not remembered */
  }
}

export function clearApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    /* nothing to clear */
  }
}

/** Show enough to recognise a key, never enough to use it. */
export function maskKey(value: string): string {
  if (value.length < 8) return "••••";
  return `${value.slice(0, 6)}••••••••${value.slice(-4)}`;
}

export function readDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_STORAGE);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(DEVICE_STORAGE, created);
    return created;
  } catch {
    return "anon";
  }
}
