import test from "node:test";
import assert from "node:assert/strict";

const SUPABASE = "https://xcpufhqegxumpqoeqmqb.supabase.co";

async function cspFor(env: { url: string | undefined }): Promise<string> {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevBare = process.env.SUPABASE_URL;
  if (env.url === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  }
  try {
    const cfg = (await import("../next.config.mjs")).default;
    const all = await cfg.headers();
    const csp = all[0].headers.find((h: { key: string }) => h.key === "Content-Security-Policy");
    assert.ok(csp, "CSP header is present");
    return csp.value;
  } finally {
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevBare === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevBare;
  }
}

test("CSP connect-src allows the direct browser Supabase origin", async () => {
  const csp = await cspFor({ url: SUPABASE });
  const connectSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src"));
  assert.ok(connectSrc, "connect-src directive is present");
  assert.ok(
    connectSrc.includes(SUPABASE),
    `connect-src must allow ${SUPABASE} — the browser talks to it directly`,
  );
});

test("CSP connect-src keeps the other runtime origins (AI + images)", async () => {
  const csp = await cspFor({ url: SUPABASE });
  assert.ok(csp.includes("connect-src"));
  assert.ok(csp.includes("https://generativelanguage.googleapis.com"));
  assert.ok(csp.includes("https://image.pollinations.ai"));
  assert.ok(csp.includes("'self'"));
});

test("CSP with no Supabase configured does not crash and does not invent an origin", async () => {
  const csp = await cspFor({ url: undefined });
  const connectSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src"));
  assert.ok(connectSrc, "connect-src directive is present");
  assert.ok(!connectSrc.includes("supabase"), "no invented Supabase origin when unconfigured");
});

test("CSP with a malformed Supabase URL does not crash the build", async () => {
  const csp = await cspFor({ url: "not a url" });
  const connectSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("connect-src"));
  assert.ok(connectSrc, "connect-src directive is present");
  assert.ok(!connectSrc.includes("supabase"), "no origin invented from a malformed URL");
});
