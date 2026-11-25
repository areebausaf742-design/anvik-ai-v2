#!/usr/bin/env node
import process from "node:process";

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
const APP_URL = (process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || "";

function baseHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function sbSelect(table, query) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: baseHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function sbUpsert(table, rows, conflict) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
      method: "POST",
      headers: { ...baseHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function runSmokeChecks() {
  const results = [];
  if (!APP_URL) {
    results.push({ name: "app_url", ok: false, detail: "APP_URL not configured" });
    return results;
  }
  try {
    const res = await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(8000) });
    const json = await res.json().catch(() => ({}));
    results.push({ name: "health", ok: res.ok && json?.status === "ok", detail: `status=${res.status}` });
  } catch (e) {
    results.push({ name: "health", ok: false, detail: String(e?.message || e) });
  }
  return results;
}

async function postGitHubIssue(title, body) {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({ title, body, labels: ["autonomous-report"] }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.html_url ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const incidents = await sbSelect("incident_logs", "status=eq.open&select=*");
  const smoke = await runSmokeChecks();

  const reportDate = new Date().toISOString().slice(0, 10);
  const totalIncidents = incidents.length;
  const autoHealed = incidents.filter((i) => i.status === "resolved").length;
  const prsOpened = incidents.filter((i) => i.status === "pr_opened").length;

  const summary = [
    `# ANVIK Daily Autonomous Report`,
    ``,
    `Date: ${reportDate}`,
    ``,
    `## Open incidents: ${totalIncidents}`,
    ...incidents.map((i) => `- [${i.severity}] ${i.route ?? "app"}: ${i.signature} (occurrences: ${i.occurrences})`),
    ``,
    `## Smoke checks`,
    ...smoke.map((s) => `- ${s.name}: ${s.ok ? "OK" : "FAIL"} — ${s.detail}`),
    ``,
    `## Summary`,
    `Auto-healed: ${autoHealed}, PRs opened: ${prsOpened}.`,
  ].join("\n");

  await sbUpsert(
    "daily_health_reports",
    [
      {
        report_date: reportDate,
        total_incidents: totalIncidents,
        auto_healed_count: autoHealed,
        prs_opened: prsOpened,
        summary_markdown: summary,
      },
    ],
    "report_date",
  );

  await postGitHubIssue("[ANVIK Daily Autonomous Report]", summary);

  console.log(summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
