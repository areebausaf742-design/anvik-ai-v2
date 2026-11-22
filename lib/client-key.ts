/**
 * Client-side Gemini key & daily quota storage.
 *
 * Key rules:
 *  - Must start with "AIza" and be at least 35 characters.
 *  - Stored in localStorage under a single key ("anvik-gemini-api-key").
 */

export const API_KEY_STORAGE = "anvik-gemini-api-key";
export const DEVICE_STORAGE = "anvik-device-id";
export const QUOTA_STORAGE = "anvik-daily-quota";
export const DAILY_QUOTA_LIMIT = 100;

export const KEY_FORMAT_MESSAGE = "That key doesn't look right. Check its format or replace it in Settings.";

export function isValidGeminiKey(value: string | undefined | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.startsWith("AIza") && trimmed.length >= 35;
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

function todayKeyIst(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export type DailyQuota = {
  date: string;
  used: number;
  limit: number;
  remaining: number;
  lastModel?: string;
};

export function readDailyQuota(): DailyQuota {
  const today = todayKeyIst();
  try {
    const raw = localStorage.getItem(QUOTA_STORAGE);
    if (!raw) return { date: today, used: 0, limit: DAILY_QUOTA_LIMIT, remaining: DAILY_QUOTA_LIMIT };
    const parsed = JSON.parse(raw) as Partial<DailyQuota>;
    if (parsed.date !== today || typeof parsed.used !== "number") {
      return { date: today, used: 0, limit: DAILY_QUOTA_LIMIT, remaining: DAILY_QUOTA_LIMIT };
    }
    const used = Math.max(0, Math.min(DAILY_QUOTA_LIMIT, parsed.used));
    return {
      date: today,
      used,
      limit: DAILY_QUOTA_LIMIT,
      remaining: Math.max(0, DAILY_QUOTA_LIMIT - used),
      lastModel: typeof parsed.lastModel === "string" ? parsed.lastModel : undefined,
    };
  } catch {
    return { date: today, used: 0, limit: DAILY_QUOTA_LIMIT, remaining: DAILY_QUOTA_LIMIT };
  }
}

export function recordDailyUsage(model?: string): DailyQuota {
  const current = readDailyQuota();
  const next: DailyQuota = {
    date: current.date,
    used: Math.min(DAILY_QUOTA_LIMIT, current.used + 1),
    limit: DAILY_QUOTA_LIMIT,
    remaining: Math.max(0, DAILY_QUOTA_LIMIT - (current.used + 1)),
    lastModel: model || current.lastModel,
  };
  try {
    localStorage.setItem(QUOTA_STORAGE, JSON.stringify(next));
  } catch {
    /* ignore storage error */
  }
  return next;
}
