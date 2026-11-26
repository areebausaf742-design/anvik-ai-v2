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

/**
 * Headers every AI request must carry.
 *
 * The bearer token is what the server verifies; without it an AI route answers
 * 401 no matter who is signed in. The Creative Studio (image/code/voice) and the
 * Vision studio built their own header objects and omitted it, so those screens
 * could not authenticate a signed-in user at all — they were dead on arrival
 * against `requireUser`.
 *
 * `token` comes from `useSession().bearerToken()`; passing null/empty just means
 * "no token", which the server treats as a guest.
 */
export function aiRequestHeaders(options: {
  token?: string | null;
  apiKey?: string | null;
  accept?: string;
  requestId?: string;
} = {}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-anvik-device": readDeviceId(),
  };
  if (options.accept) headers.Accept = options.accept;
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  // A user-supplied Gemini key is sent as its own header, never as a bearer
  // token — the two mean different things to the server.
  if (options.apiKey) headers["x-google-generative-ai-api-key"] = options.apiKey;
  if (options.requestId) headers["x-anvik-request-id"] = options.requestId;
  return headers;
}

const TECHNICAL_ERROR =
  /unexpected end|terminated|readablestream|body stream|networkerror|failed to fetch|load failed|fetch failed|the operation was aborted|aborterror|socket hang up/i;

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
    if (!err.message.trim() || TECHNICAL_ERROR.test(err.message)) {
      return "ANVIK lost the connection. Please try again.";
    }
    return err.message;
  }
  return "No internet. Try again";
}

export function mapHttpErrorMessage(status: number, serverMessage?: string, code?: string): string {
  if (status === 401 || status === 403) {
    // An auth refusal and a bad personal key are different problems with
    // different fixes. Reporting a missing session as "key invalid" sent people
    // to their Gemini key settings when all they needed was to sign in.
    if (code === "unauthenticated") {
      return "Sign in to use this. It's free — your account keeps your history and credits.";
    }
    if (serverMessage && /ANVIK free key is not set|aistudio\.google\.com/i.test(serverMessage)) {
      return serverMessage;
    }
    return "Key invalid or expired. Check your saved API key and try again.";
  }
  if (status === 429) {
    if (code === "guest_limit_reached") {
      return "You've used today's free questions. Sign in for more — it's free, and your history follows you.";
    }
    if (code === "plan_limit_reached") {
      return "You've reached your plan limit. Upgrade at /pricing or connect your own key to continue.";
    }
    if (code === "free_limit_reached") {
      return "Free limit reached. Connect your own key to continue unlimited.";
    }
    if (code === "rate_limit") {
      return "Too many requests in a short window — please wait a moment and try again.";
    }
    return serverMessage || "Free limit reached. Connect your own key to continue unlimited.";
  }
  if (status === 503) {
    return serverMessage || "No internet. Try again";
  }
  return serverMessage || "ANVIK could not complete this request. Please try again.";
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
      message: data.message ?? "ANVIK is ready.",
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
