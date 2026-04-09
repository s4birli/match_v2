import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Auth", () => {
  test("login as demo user, see dashboard, then log out", async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, "user.demo@example.com", "Test1234!");

    // Should land on /dashboard (default post-login)
    await expect(page).toHaveURL(/\/dashboard/);

    // "Hello" greeting appears on dashboard (from dictionaries.ts en: "Hello")
    const body = page.locator("body");
    await expect(body).toContainText(/Hello/i);
    // Display name for demo user should be present
    await expect(body).toContainText(/Demo User/i);

    // Log out via logout-button
    await page.getByTestId("logout-button").click();
    await page.waitForURL((url) => url.pathname.startsWith("/login"), {
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test("login form renders with all fields", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.getByTestId("email-input")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("password-input")).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });
});
