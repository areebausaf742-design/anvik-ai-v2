import { cookies } from "next/headers";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  const deviceId = jar.get("anvik_dev")?.value ?? "nodev";
  return Response.json({ remaining: store.questionRemaining(deviceId) });
}
