import { NextRequest, NextResponse } from "next/server";
import { supabaseEnabled, sbSelectDetailed, sbInsert, sbUpdateWhereDetailed } from "@/lib/supabase";
import { redactSecrets, sanitizeTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  signature?: string;
  severity?: string;
  route?: string;
  message?: string;
  stack?: string;
};

function makeSignature(body: Body): string {
  const base = (body.signature ?? "").trim();
  if (base) return base.slice(0, 200);
  const msg = redactSecrets(String(body.message ?? "unknown")).slice(0, 120);
  return `${body.route ?? "app"}:${msg}`.slice(0, 200);
}

export async function POST(req: NextRequest) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }
  const sanitized = sanitizeTelemetry(body as Record<string, unknown>) as Body;
  const signature = makeSignature(sanitized);
  const severity = (sanitized.severity ?? "error").toString().slice(0, 32);
  const route = (sanitized.route ?? "").toString().slice(0, 200);
  const message = redactSecrets(String(sanitized.message ?? "")).slice(0, 2000);
  const stack = redactSecrets(String(sanitized.stack ?? "")).slice(0, 8000);

  if (supabaseEnabled()) {
    try {
      const existing = await sbSelectDetailed<{ id: string; occurrences: number }>(
        "incident_logs",
        `signature=eq.${encodeURIComponent(signature)}&select=id,occurrences`,
      );
      if (existing.ok && existing.rows.length > 0) {
        const row = existing.rows[0];
        await sbUpdateWhereDetailed("incident_logs", `signature=eq.${encodeURIComponent(signature)}`, {
          occurrences: (row.occurrences ?? 1) + 1,
          last_seen_at: new Date().toISOString(),
          message,
          stack,
          route,
          severity,
          status: "open",
        });
      } else {
        await sbInsert("incident_logs", [
          {
            signature,
            severity,
            route,
            message,
            stack,
            occurrences: 1,
            status: "open",
            last_seen_at: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      // best-effort; never block response
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
