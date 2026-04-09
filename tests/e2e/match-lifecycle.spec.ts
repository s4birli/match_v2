import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Match lifecycle (admin)", () => {
  test("admin creates match, assigns 2 participants, closes with score", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await login(page, "admin.demo@example.com", "Test1234!");

    // Go to create match page
    await page.goto("/admin/matches/new", { waitUntil: "domcontentloaded" });
    await page.getByTestId("match-title").waitFor({ state: "visible" });

    // Fill the form
    await page.getByTestId("match-title").fill("E2E Test Match");
    await page.getByTestId("match-format").fill("6v6");
    await page.getByTestId("match-players").fill("6");
    await page.getByTestId("match-fee").fill("5");

    // Submit
    await page.getByTestId("match-submit").click();

    // Wait for navigation to /admin/matches/{id}
    await page.waitForURL(/\/admin\/matches\/[0-9a-f-]+$/, { timeout: 20_000 });

    const matchUrl = page.url();
    expect(matchUrl).toMatch(/\/admin\/matches\/[0-9a-f-]+$/);

    // Add at least 2 participants via add-participant-* buttons
    const addButtonsLocator = page.locator('[data-testid^="add-participant-"]');
    await expect(addButtonsLocator.first()).toBeVisible({ timeout: 10_000 });
    const initialCount = await addButtonsLocator.count();
    expect(initialCount, "expected at least 2 candidates").toBeGreaterThanOrEqual(2);

    // Click the first two Add buttons, waiting for the list to shrink between clicks
    for (let i = 0; i < 2; i++) {
      const target = page.locator('[data-testid^="add-participant-"]').first();
      const targetId = await target.getAttribute("data-testid");
      await target.click();
      // Wait until that specific testid disappears from the list
      await expect(page.locator(`[data-testid="${targetId}"]`)).toHaveCount(0, {
        timeout: 10_000,
      });
    }

    // Assign participants to teams (one red, one blue)
    const redBtn = page.locator('[data-testid^="assign-red-"]').first();
    await expect(redBtn).toBeVisible({ timeout: 10_000 });
    await redBtn.click();

    const blueBtn = page.locator('[data-testid^="assign-blue-"]').first();
    await expect(blueBtn).toBeVisible({ timeout: 10_000 });
    await blueBtn.click();

    // Close the match with red=2, blue=1
    await page.getByTestId("close-red-score").fill("2");
    await page.getByTestId("close-blue-score").fill("1");
    await page.getByTestId("close-submit").click();

    // Verify either the toast "Match closed" or status badge changes to "completed" / "Final score"
    const body = page.locator("body");
    await expect(async () => {
      const text = await body.innerText();
      expect(/Match closed|completed|Final score/i.test(text)).toBe(true);
    }).toPass({ timeout: 15_000 });
  });
});
