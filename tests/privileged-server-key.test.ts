import test from "node:test";
import assert from "node:assert/strict";

const URL = "https://fake.supabase.test";
const SERVICE = "service-role-test-key";
const ANON = "anon-test-key";

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  const keys = [
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
  ];
  const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const set = (k: string, v: string | undefined) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  for (const k of keys) set(k, undefined);
  set("SUPABASE_URL", env.SUPABASE_URL ?? URL);
  set("SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY);
  set("SUPABASE_SERVICE_KEY", env.SUPABASE_SERVICE_KEY);
  set("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  set("NEXT_PUBLIC_SUPABASE_ANON_KEY", env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  set("SUPABASE_ANON_KEY", env.SUPABASE_ANON_KEY);
  return fn().finally(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k]!;
    }
  });
}

test("privileged server adapter is never enabled by a browser/publishable key", async () => {
  await withEnv(
    {
      SUPABASE_URL: URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "browser-publishable-key",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
      SUPABASE_ANON_KEY: ANON,
    },
    async () => {
      const { supabaseEnabled, sbSelect } = await import("../lib/supabase");
      assert.equal(supabaseEnabled(), false, "an anon key must never enable privileged server access");
      const rows = await sbSelect("consent_records", "user_id=eq.x");
      assert.equal(rows, null, "writes/reads must be refused when the service role is absent");
    },
  );
});

test("privileged server adapter is enabled with the service-role key", async () => {
  await withEnv(
    { SUPABASE_URL: URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE },
    async () => {
      const { supabaseEnabled } = await import("../lib/supabase");
      assert.equal(supabaseEnabled(), true);
    },
  );
});

test("legacy SUPABASE_SERVICE_KEY enables the adapter (service-role family only)", async () => {
  await withEnv(
    { SUPABASE_URL: URL, SUPABASE_SERVICE_KEY: SERVICE },
    async () => {
      const { supabaseEnabled } = await import("../lib/supabase");
      assert.equal(supabaseEnabled(), true);
    },
  );
});

test("the adapter refuses to write when only a browser publishable key is present", async () => {
  await withEnv(
    { SUPABASE_URL: URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key" },
    async () => {
      const { sbInsertDetailed } = await import("../lib/supabase");
      const result = await sbInsertDetailed("consent_records", [{ user_id: "x" }]);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.category, "bad_response");
      }
    },
  );
});
