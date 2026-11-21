import {
  KEY_FORMAT_MESSAGE,
  isValidGeminiKey,
  readApiKey,
  readRawApiKey,
  readDeviceId,
} from "./client-key";

export type KeyCheckResult =
  | { ok: true; model: string; message: string }
  | { ok: false; error: string; code?: string };

export function validateStoredKeyBeforeSend(): { ok: true; apiKey: string } | { ok: false; error: string } {
  const raw = readRawApiKey();
  if (!raw) {
    // Allow sending without a local key only if server has an env key,
    // OR let server return 401 if none is configured; wait: if raw is non-empty and invalid, fail immediately!
    return { ok: true, apiKey: "" };
  }
  if (!isValidGeminiKey(raw)) {
    return { ok: false, error: KEY_FORMAT_MESSAGE };
  }
  return { ok: true, apiKey: raw };
}

export function mapClientFetchError(err: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "No internet. Try again";
  }
  if (err instanceof TypeError) {
    return "No internet. Try again";
  }
  if (err instanceof Error) {
    if (/failed to fetch|networkerror|network request failed|load failed/i.test(err.message)) {
      return "No internet. Try again";
    }
    return err.message;
  }
  return "No internet. Try again";
}

export function mapHttpErrorMessage(status: number, serverMessage?: string): string {
  if (status === 401 || status === 403) {
    if (serverMessage && serverMessage.includes("aistudio.google.com")) {
      return serverMessage;
    }
    return "Key invalid or expired. Create new key in Google AI Studio";
  }
  if (status === 429) {
    return "Free quota finished. Wait 1 hour or use another Google account key";
  }
  if (status === 503) {
    return serverMessage || "No internet. Try again";
  }
  return serverMessage || "Gemini could not complete this request. Please try again.";
}

export async function testGeminiKeyRequest(candidateKey?: string): Promise<KeyCheckResult> {
  const key = (candidateKey ?? readRawApiKey()).trim();
  if (!isValidGeminiKey(key)) {
    return { ok: false, error: KEY_FORMAT_MESSAGE, code: "bad_format" };
  }

  try {
    const response = await fetch("/api/test-key", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-anvik-device": readDeviceId(),
        "x-google-generative-ai-api-key": key,
      },
      body: JSON.stringify({ apiKey: key }),
    });
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      model?: string;
      message?: string;
      error?: string;
      code?: string;
    } | null;

    if (!response.ok || !data?.ok) {
      return {
        ok: false,
        error: mapHttpErrorMessage(response.status, data?.error),
        code: data?.code,
      };
    }

    return {
      ok: true,
      model: data.model ?? "gemini-2.0-flash",
      message: data.message ?? `Connected (${data.model ?? "gemini-2.0-flash"})`,
    };
  } catch (err) {
    return { ok: false, error: mapClientFetchError(err), code: "network" };
  }
}

export function buildRequestHeaders(): Record<string, string> {
  const apiKey = readApiKey();
  return {
    "Content-Type": "application/json",
    "x-anvik-device": readDeviceId(),
    ...(apiKey ? { "x-google-generative-ai-api-key": apiKey } : {}),
  };
}
