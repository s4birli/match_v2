import { test, expect } from "@playwright/test";
import { login, expectNoAppError } from "./helpers";

test.describe("Role isolation", () => {
  test("owner lands on /owner/dashboard and cannot reach /dashboard", async ({ page }) => {
    await login(page, "owner@example.com");
    await expect(page).toHaveURL(/\/owner\/dashboard/);
    await expectNoAppError(page);

    // Force-navigate to /dashboard — should redirect back to /owner/dashboard
    await page.goto("/dashboard");
    await page.waitForURL(/\/owner\/dashboard/, { timeout: 10_000 });
  });

  test("owner sidebar does NOT contain user-only links", async ({ page }) => {
    await login(page, "owner@example.com");
    // Wait until at least one owner-* link is mounted (proves shell rendered).
    await page.locator('a[href^="/owner/"]').first().waitFor({ timeout: 15_000 });
    // Owner sidebar should NOT have any user-only links
    const walletLinks = await page.locator('a[href="/wallet"]').count();
    const statsLinks = await page.locator('a[href="/stats"]').count();
    const profileLinks = await page.locator('a[href="/profile"]').count();
    const matchesLinks = await page.locator('a[href="/matches"]').count();
    const dashLinks = await page.locator('a[href="/dashboard"]').count();
    expect(walletLinks).toBe(0);
    expect(statsLinks).toBe(0);
    expect(profileLinks).toBe(0);
    expect(matchesLinks).toBe(0);
    expect(dashLinks).toBe(0);
    // And SHOULD have multiple owner links
    const ownerLinks = await page.locator('a[href^="/owner/"]').count();
    expect(ownerLinks).toBeGreaterThan(0);
  });

  test("regular user does NOT see admin or owner links", async ({ page }) => {
    await login(page, "levent@example.com");
    await expect(page).toHaveURL(/\/dashboard/);
    const adminLinks = await page.locator('a[href^="/admin/"]').count();
    const ownerLinks = await page.locator('a[href^="/owner/"]').count();
    expect(adminLinks).toBe(0);
    expect(ownerLinks).toBe(0);
  });

  test("assistant_admin does NOT see finance / members / venues / invites", async ({ page }) => {
    await login(page, "assistant.north@example.com");
    // Assistant is allowed at /admin/matches
    const walletLinks = await page.locator('a[href="/wallet"]').count();
    const memberLinks = await page.locator('a[href="/admin/members"]').count();
    const venueLinks = await page.locator('a[href="/admin/venues"]').count();
    const paymentLinks = await page.locator('a[href="/admin/payments"]').count();
    const inviteLinks = await page.locator('a[href="/admin/invites"]').count();
    expect(walletLinks).toBe(0);
    expect(memberLinks).toBe(0);
    expect(venueLinks).toBe(0);
    expect(paymentLinks).toBe(0);
    expect(inviteLinks).toBe(0);
  });

  test("regular user cannot reach admin pages (server-side redirect)", async ({ page }) => {
    await login(page, "levent@example.com");
    await page.goto("/admin/members");
    await page.waitForURL(/\/dashboard|\/login/, { timeout: 10_000 });
  });

  test("regular user cannot reach owner pages", async ({ page }) => {
    await login(page, "levent@example.com");
    await page.goto("/owner/tenants");
    // Should redirect away (to /dashboard for users)
    await page.waitForURL((url) => !url.pathname.startsWith("/owner"), { timeout: 10_000 });
  });

  test("owner can create a new tenant", async ({ page }) => {
    await login(page, "owner@example.com");
    await page.goto("/owner/tenants");
    await page.waitForLoadState("domcontentloaded");

    const stamp = Date.now();
    const slug = `smoke-${stamp}`.toLowerCase();
    await page.getByTestId("tenant-name").fill(`Smoke Tenant ${stamp}`);
    await page.getByTestId("tenant-slug").fill(slug);
    await page.getByTestId("tenant-fee").fill("3");
    await page.getByTestId("tenant-submit").click();
    // After success, page refreshes and a new tenant card appears.
    await expect(page.locator("body")).toContainText(`Smoke Tenant ${stamp}`, { timeout: 10_000 });
  });
});
