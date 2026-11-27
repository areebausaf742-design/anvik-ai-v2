/**
 * Auth-gate end-to-end tests.
 *
 * Covers the first-visit experience from the product brief:
 *
 *   - guest   — a stranger can open the public home page and use the chat bar
 *   - redirect — pressing send hands off to /login with the draft preserved
 *   - sign-in   — after signing in, the visitor arrives where they intended
 *   - draft restore + send — the restored draft is sent from /chat
 *
 * The sign-in / draft-restore / send portion requires real credentials
 * (E2E_TEST_EMAIL + E2E_TEST_PASSWORD against a configured Supabase project)
 * and is skipped when they are absent, since this sandbox has no test account.
 */

import { test, expect } from "@playwright/test";

const DRAFT = "hii";

test.describe("auth gate", () => {
  test("guest can open the public home page and use the chat bar", async ({ page }) => {
    await page.goto("/");

    // The landing page is public: no login wall, confident hero, live bar.
    await expect(page.getByRole("heading", { name: /ask anything/i }).first()).toBeVisible();
    await expect(page.getByRole("textbox", { name: /ask anvik anything/i })).toBeVisible();
  });

  test("sending from the public bar streams a guest answer inline (no redirect)", async ({
    page,
  }) => {
    await page.goto("/");

    const chatBar = page.getByRole("textbox", { name: /ask anvik anything/i });
    await chatBar.click();
    await chatBar.fill(DRAFT);
    await chatBar.press("Enter");

    // Guest chat streams an answer inline — no redirect to /login.
    await expect(page).toHaveURL("/");
    await expect(page.getByText(DRAFT, { exact: true })).toBeVisible();
  });

  test.describe("signed-in flow (requires real credentials)", () => {
    const hasCredentials = Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);

    test.skip(!hasCredentials, "set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run the signed-in flow");

    test("draft is restored and sent after sign-in", async ({ page }) => {
      await page.goto("/");

      const chatBar = page.getByRole("textbox", { name: /ask anvik anything/i });
      await chatBar.click();
      await chatBar.fill(DRAFT);
      await chatBar.press("Enter");
      await expect(page).toHaveURL(/\/login/);

      // Sign in with email + password.
      await page.getByLabel(/email/i).fill(process.env.E2E_TEST_EMAIL!);
      await page.getByLabel(/password/i).fill(process.env.E2E_TEST_PASSWORD!);
      await page.getByRole("button", { name: /sign in/i }).click();

      // After sign-in the draft is restored on /chat and sent.
      await expect(page).toHaveURL(/\/chat/);
      await expect(
        page.getByRole("textbox", { name: /ask anvik anything/i }),
      ).toHaveValue(DRAFT);

      const sendButton = page.getByRole("button", { name: /send message/i });
      await expect(sendButton).toBeEnabled();
      await sendButton.click();

      // The assistant message appears (streaming begins).
      await expect(page.getByText(/anvik/i)).toBeVisible();
    });
  });
});
