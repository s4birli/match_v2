import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Privacy", () => {
  test("leaderboard does not expose raw rating values", async ({ page }) => {
    await login(page);

    await page.goto("/stats", { waitUntil: "domcontentloaded" });
    // Wait until the streamed page replaces loading.tsx
    await page.waitForSelector("main", { timeout: 30_000 });
    await page.waitForLoadState("networkidle");

    const bodyText = (await page.locator("body").innerText()).toLowerCase();

    // Forbidden phrases (per CLAUDE.md privacy rules)
    const forbidden = [
      "gave you",
      "rated by",
      "rated you",
      "gave a 1",
      "gave a 2",
      "gave a 3",
      "gave a 4",
      "gave a 5",
    ];
    for (const phrase of forbidden) {
      expect(bodyText, `leaderboard contained forbidden phrase: ${phrase}`).not.toContain(phrase);
    }

    // Expect an aggregate signal.
    const hasAggregate = /%|\/\s*5|avg|rating|win/i.test(bodyText);
    expect(hasAggregate, "stats page should show at least one aggregate label").toBe(true);
  });
});
