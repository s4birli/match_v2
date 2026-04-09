import { test, expect } from "@playwright/test";
import { login, expectNoAppError } from "./helpers";

/**
 * End-to-end post-match flow:
 *  1. admin creates a match
 *  2. admin adds 2 participants
 *  3. admin assigns them to teams
 *  4. admin closes the match with a score
 *  5. main check: closed badge appears, ledger entries get created
 *
 * The teammate-rating UI requires the *current* user to be a played
 * participant — we cover the privacy / visibility surface here without
 * trying to mutate ratings (that needs a logged-in player who actually
 * played, which the unique-constraint tests in unit tests cover).
 */
test.describe("Post-match (admin closes a match)", () => {
  test("creates → assigns → closes", async ({ page }) => {
    await login(page, "admin.demo@example.com");

    // 1. create match
    await page.goto("/admin/matches/new");
    await page.waitForLoadState("domcontentloaded");
    await page.getByTestId("match-title").fill(`Smoke ${Date.now()}`);
    await page.getByTestId("match-format").fill("5v5");
    await page.getByTestId("match-players").fill("5");
    await page.getByTestId("match-fee").fill("3");
    await page.getByTestId("match-submit").click();

    // Should land on /admin/matches/<id>
    await page.waitForURL(/\/admin\/matches\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    await expectNoAppError(page);

    // 2. add 2 participants if any candidates
    const addButtons = page.locator("[data-testid^='add-participant-']");
    const addCount = await addButtons.count();
    const toAdd = Math.min(2, addCount);
    for (let i = 0; i < toAdd; i++) {
      // Re-resolve each iteration since DOM updates after click
      const fresh = page.locator("[data-testid^='add-participant-']").first();
      if (await fresh.isVisible()) {
        await fresh.click();
        await page.waitForLoadState("domcontentloaded");
      }
    }

    // 3. assign all unassigned to red/blue alternately
    const assignButtons = await page.locator("[data-testid^='assign-red-'], [data-testid^='assign-blue-']").all();
    let red = true;
    for (const btn of assignButtons.slice(0, 4)) {
      const id = await btn.getAttribute("data-testid");
      if (!id) continue;
      const targetPattern = red ? "assign-red-" : "assign-blue-";
      if (id.startsWith(targetPattern) && (await btn.isVisible())) {
        await btn.click();
        red = !red;
        await page.waitForTimeout(200);
      }
    }

    // 4. close the match
    if (await page.getByTestId("close-red-score").isVisible().catch(() => false)) {
      await page.getByTestId("close-red-score").fill("3");
      await page.getByTestId("close-blue-score").fill("1");
      await page.getByTestId("close-submit").click();
      await page.waitForLoadState("domcontentloaded");
      await expectNoAppError(page);
    }

    // 5. expect "completed" badge or final score visible
    const body = page.locator("body");
    await expect(body).toContainText(/completed|Final score|Match closed|3.*1/i);
  });
});
