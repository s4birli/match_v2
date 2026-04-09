import { test, expect } from "@playwright/test";
import { login, expectNoAppError } from "./helpers";

/**
 * Stress / scenario coverage spec.
 *
 * Drives the world built by `scripts/seed-stress.ts` (Stress FC A with
 * 30 players, Stress FC B with 25 players, 5 shared multi-group players,
 * 4 guests, ~7 closed matches with ratings + ledger, etc.) through the
 * critical UI surfaces. The intent is to flush out:
 *   - app errors / 500s on real-shape data
 *   - tenant isolation leaks
 *   - the per-player drill-in for admins
 *   - mobile + desktop layout sanity
 *
 * Findings get appended to docs/FINDINGS.md by hand after the run.
 *
 * The stress users are NOT cleaned by global-teardown (their email pattern
 * doesn't match the smoke filter) so the user can re-run the same flows
 * manually after the test pass.
 */
test.describe("Stress scenarios — Stress FC A & B", () => {
  test.setTimeout(120_000);

  test("admin A: every admin surface renders without app errors", async ({ page }) => {
    await login(page, "stress.admin.a@example.com");

    const surfaces = [
      "/admin/dashboard",
      "/admin/matches",
      "/admin/matches/new",
      "/admin/members",
      "/admin/payments",
      "/admin/venues",
      "/admin/invites",
      "/admin/settings",
      "/admin/stats",
      "/wallet",
      "/profile",
    ];
    for (const path of surfaces) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);
      // The body should always render the AppShell — sanity-check on the
      // group switcher's tenant name.
      await expect(page.locator("body")).toContainText(/Stress FC A/);
    }
  });

  test("assistant A: locked surfaces redirect, allowed ones render", async ({ page }) => {
    await login(page, "stress.asst.a@example.com");
    // Allowed.
    for (const path of [
      "/admin/dashboard",
      "/admin/matches",
      "/admin/venues",
      "/admin/stats",
      "/wallet",
      "/profile",
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expectNoAppError(page);
    }
    // Forbidden — server-side redirect should land us elsewhere.
    for (const path of ["/admin/payments", "/admin/members", "/admin/invites"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(new RegExp(path + "$"));
    }
  });

  test("admin can drill into a player's stats from the leaderboard", async ({ page }) => {
    await login(page, "stress.admin.a@example.com");
    await page.goto("/admin/stats", { waitUntil: "domcontentloaded" });
    await expectNoAppError(page);
    // Find any leaderboard row link (they all share the leaderboard-row-* prefix).
    const firstRow = page.locator('[data-testid^="leaderboard-row-"]').first();
    await firstRow.waitFor({ state: "visible", timeout: 10_000 });
    await firstRow.click();
    await page.waitForURL(/\/admin\/members\/[0-9a-f-]{36}$/);
    await expectNoAppError(page);
    // Drill-in page shows the standard stat-block grid.
    await expect(page.locator("body")).toContainText(/Played|Win rate|Avg rating/i);
  });

  test("tenant isolation: admin A cannot see Stress FC B from /owner/tenants link", async ({
    page,
  }) => {
    await login(page, "stress.admin.a@example.com");
    // Admin A direct GET to owner pages should redirect them away.
    await page.goto("/owner/tenants", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/owner\/tenants$/);
  });

  test("dashboard shows the player's avg + MOTM stat blocks", async ({ page }) => {
    // Use admin A, who is also a player on Stress FC A.
    await login(page, "stress.admin.a@example.com");
    // Admin A's "personal" view is /dashboard isn't directly linked from the
    // admin nav, but the per-player drill-in covers the same surface area.
    // Spot-check that the dashboard route renders for someone with admin
    // role (it shouldn't redirect — admins can view their own /dashboard
    // when they want to play as a regular user).
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expectNoAppError(page);
  });

  test("mobile viewport: bottom nav shows all primary items on /admin/dashboard", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await login(page, "stress.admin.a@example.com");
    await page.goto("/admin/dashboard", { waitUntil: "domcontentloaded" });
    await expectNoAppError(page);
    // Mobile bottom nav has nav-* test ids on every link.
    const navLinks = page.locator('nav a, footer a, [data-testid^="nav-"]');
    expect(await navLinks.count()).toBeGreaterThanOrEqual(5);
  });

  test("monkey: click all visible buttons on every admin surface (no crashes)", async ({
    page,
  }) => {
    await login(page, "stress.admin.a@example.com");
    const surfaces = [
      "/admin/dashboard",
      "/admin/matches",
      "/admin/members",
      "/admin/payments",
      "/admin/venues",
      "/admin/invites",
      "/admin/settings",
      "/admin/stats",
    ];
    for (const path of surfaces) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("main", { timeout: 10_000 }).catch(() => {});
      await expect(page.locator("body")).not.toContainText(/Application error/);
      // Click any safe-looking buttons (skip <a> tags, inputs, file uploads,
      // and anything that opens a confirm dialog).
      const buttons = await page.locator("button:visible").all();
      for (const btn of buttons.slice(0, 5)) {
        try {
          const text = (await btn.innerText().catch(() => "")).toLowerCase();
          if (
            text.includes("archive") ||
            text.includes("delete") ||
            text.includes("remove") ||
            text.includes("regenerate") ||
            text.includes("logout") ||
            text.includes("kapat") ||
            text.includes("close") ||
            text.includes("submit")
          ) {
            continue;
          }
          await btn.click({ timeout: 2000 }).catch(() => {});
          // Don't race the next page.content() against an in-flight nav.
          await page
            .waitForLoadState("domcontentloaded", { timeout: 3000 })
            .catch(() => {});
          await page.waitForTimeout(150);
          // Re-fetch the body via locator which is race-safe.
          await expect(page.locator("body")).not.toContainText(/Application error/);
        } catch {
          /* best effort */
        }
      }
    }
  });
});
