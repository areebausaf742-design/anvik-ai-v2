import { cookies } from "next/headers";
import { isValidGeminiKeyFormat } from "@/lib/gemini";
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
  const status = !hasServerKey
    ? "not_configured"
    : !isValidGeminiKeyFormat(configuredKey)
      ? "invalid_server_key"
      : remaining === 0
        ? "limit_reached"
        : "ok";

  return Response.json({ hasServerKey, status, remaining });
}
