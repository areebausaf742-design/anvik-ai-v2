import { cookies } from "next/headers";
import { MODEL_FALLBACK_CHAIN, validateGeminiServerKey } from "@/lib/gemini";
import { serverKey } from "@/lib/provider";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  const deviceId = jar.get("anvik_dev")?.value ?? "nodev";
  const remaining = store.questionRemaining(deviceId);
  const configuredKey = serverKey();
  const hasServerKey = Boolean(configuredKey);
  const validation = configuredKey
    ? await validateGeminiServerKey(configuredKey)
    : { googleStatus: null, invalid: false };
  const status = !hasServerKey
    ? "not_configured"
    : validation.invalid
      ? "invalid_server_key"
      : remaining === 0
        ? "limit_reached"
        : "ok";

  return Response.json({
    hasServerKey,
    status,
    remaining,
    googleStatus: validation.googleStatus,
    modelUsed: MODEL_FALLBACK_CHAIN[0],
  });
}
