import { allow, clientIdentity } from "@/lib/rate-limit";
import { redact } from "@/lib/learning";
import { sbInsert, supabaseEnabled } from "@/lib/supabase";

/**
 * Optional server mirror for what ANVIK learns.
 *
 * The product has no accounts on purpose ("No account needed"), so this is not
 * a login feature: it is a best-effort copy of likes, dislikes and corrections
 * for a device, written only when SUPABASE_URL and a key are configured. The
 * browser copy in localStorage stays the source of truth — if this route
 * fails, nothing the user does stops working.
 *
 * Everything is redacted again here. A client bug must not be able to write an
 * API key or a phone number into the database.
 */

type Body = {
  deviceId?: unknown;
  verdict?: unknown;
  question?: unknown;
  answer?: unknown;
  correction?: unknown;
  mode?: unknown;
};

const MAX = 4000;

function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX) : "";
}

export async function POST(request: Request) {
  if (!supabaseEnabled()) {
    // Not an error: learning is local-first, so there is simply nothing to sync.
    return Response.json({ stored: false, sync: "not configured" }, { status: 202 });
  }

  if (!allow(`learn:${clientIdentity(request, request.headers.get("x-anvik-device"))}`, 20, 240)) {
    return Response.json({ stored: false, error: "Too many requests." }, { status: 429 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ stored: false, error: "Send a JSON body." }, { status: 400 });
  }

  const verdict = body.verdict === "like" || body.verdict === "dislike" || body.verdict === "correction"
    ? body.verdict
    : null;
  const question = redact(text(body.question)).text;
  const answer = redact(text(body.answer)).text;
  const correction = redact(text(body.correction)).text;

  if (!verdict || question.trim().length < 2 || (!answer.trim() && !correction.trim())) {
    return Response.json({ stored: false, error: "Nothing to record." }, { status: 400 });
  }

  const device = text(body.deviceId) || "anonymous";
  const stored = await sbInsert("anvik_learning", [
    {
      id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      device_id: device.slice(0, 64),
      verdict,
      question,
      answer,
      correction,
      mode: text(body.mode).slice(0, 16) || "smart",
      created_at: Date.now(),
    },
  ]);

  return Response.json({ stored, sync: stored ? "supabase" : "failed" }, { status: stored ? 200 : 202 });
}
