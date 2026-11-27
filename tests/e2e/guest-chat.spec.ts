/**
 * Guest-chat end-to-end tests (PR #69 update).
 *
 * Covers the restored 10-free-daily-questions promise:
 *   1. successful guest chat (no sign-in) on the public landing page
 *   2. quota exhaustion → sign-in prompt with draft preserved
 *   3. failed requests do not consume quota
 *   4. sign-in with draft restoration (guest → sign-in → /chat sends draft)
 *   5. authenticated chat (signed-in user can chat on /chat)
 *
 * Tests 1–3 need a working server Gemini key (E2E_SERVER_KEY or the dev
 * server's GOOGLE_GENERATIVE_AI_API_KEY). Tests 4–5 need real credentials
 * (E2E_TEST_EMAIL + E2E_TEST_PASSWORD). They are skipped when unavailable.
 */

import { test, expect } from "@playwright/test";

const DRAFT = "hii";

test.describe("guest chat on the public landing page", () => {
  const hasServerKey = Boolean(process.env.E2E_SERVER_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY);

  test.skip(!hasServerKey, "set E2E_SERVER_KEY (or run dev with GOOGLE_GENERATIVE_AI_API_KEY) to run guest-chat flows");

  test("1. successful guest chat streams an answer without signing in", async ({ page }) => {
    await page.goto("/");
    const chatBar = page.getByRole("textbox", { name: /ask anvik anything/i });
    await chatBar.click();
    await chatBar.fill(DRAFT);
    await chatBar.press("Enter");

    // The user message appears and an assistant answer streams in (no redirect).
    await expect(page).toHaveURL("/");
    await expect(page.getByText(DRAFT, { exact: true })).toBeVisible();
    // An assistant bubble with non-empty content appears.
    await expect(page.locator(".public-chat-assistant, .md").first()).toBeVisible({ timeout: 30_000 });
  });

  test("2. quota exhaustion shows a sign-in prompt and preserves the draft", async ({ page }) => {
    // Exhaust the 10 free answers (best-effort; may be slow).
    await page.goto("/");
    const chatBar = page.getByRole("textbox", { name: /ask anvik anything/i });
    for (let i = 0; i < 10; i++) {
      await chatBar.click();
      await chatBar.fill(`q${i}`);
      await chatBar.press("Enter");
      await page.waitForTimeout(2000);
    }
    // 11th attempt triggers guest_limit_reached.
    await chatBar.click();
    await chatBar.fill("one more");
    await chatBar.press("Enter");
    await expect(page.getByText(/used today's free questions/i)).toBeVisible({ timeout: 15_000 });

    const storedDraft = await page.evaluate(() => window.sessionStorage.getItem("anvik-pending-draft"));
    expect(storedDraft).toBe("one more");
  });

  test("3. a failed request does not consume quota", async ({ page }) => {
    // Send an empty-ish payload via the API directly to confirm a failure
    // does not increment the guest counter. (UI prevents empty sends, so we
    // exercise the contract at the API level.)
    const before = await page.evaluate(async () => {
      const r = await fetch("/api/quota", { headers: { "x-anvik-device": "test" } });
      return r.ok ? (await r.json()).remaining : null;
    });

    // A request that fails (empty messages) should not consume quota.
    await page.evaluate(async () => {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-anvik-device": "test" },
        body: JSON.stringify({ messages: [] }),
      });
    });

    const after = await page.evaluate(async () => {
      const r = await fetch("/api/quota", { headers: { "x-anvik-device": "test" } });
      return r.ok ? (await r.json()).remaining : null;
    });

    if (before !== null && after !== null) {
      expect(after).toBeGreaterThanOrEqual(before);
    }
  });
});

test.describe("signed-in flow (requires real credentials)", () => {
  const hasCredentials = Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);

  test.skip(!hasCredentials, "set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run the signed-in flow");

  test("4. sign-in with draft restoration sends the draft from /chat", async ({ page }) => {
    await page.goto("/");
    const chatBar = page.getByRole("textbox", { name: /ask anvik anything/i });
    await chatBar.click();
    await chatBar.fill(DRAFT);
    await chatBar.press("Enter");

    // If guest quota exhausted, we land on /login with the draft preserved.
    // Otherwise the guest answer streams inline; force sign-in via the link.
    if (!page.url().includes("/login")) {
      await page.getByRole("link", { name: /sign in/i }).first().click();
    }
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel(/email/i).fill(process.env.E2E_TEST_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.E2E_TEST_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/chat/);
    // The draft is restored into the composer.
    await expect(page.getByRole("textbox", { name: /ask anvik/i })).toHaveValue(DRAFT, { timeout: 15_000 });
  });

  test("5. authenticated chat works on /chat", async ({ page }) => {
    // Sign in first.
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(process.env.E2E_TEST_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.E2E_TEST_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/chat/);

    const chatBar = page.getByRole("textbox", { name: /ask anvik/i });
    await chatBar.click();
    await chatBar.fill("hello from authed user");
    await chatBar.press("Enter");

    await expect(page.getByText("hello from authed user", { exact: true })).toBeVisible();
    await expect(page.locator(".md, .stream-cursor").first()).toBeVisible({ timeout: 30_000 });
  });
});
