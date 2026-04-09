import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("i18n", () => {
  // Demo user is shared with the auth/dashboard tests which assume English.
  // Always restore the language back to en after this spec runs so the
  // persisted account.preferred_language doesn't bleed into the next test.
  // The page is still logged in from the test body, so just re-stamp the
  // cookie + click the en toggle in case the test failed mid-way.
  test.afterEach(async ({ page }) => {
    try {
      await page.context().addCookies([
        { name: "locale", value: "en", url: "http://localhost:3737" },
      ]);
      await page.goto("/profile", { waitUntil: "domcontentloaded" });
      const toggle = page.getByTestId("lang-toggle");
      if (await toggle.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await toggle.click();
        const enButton = page.getByTestId("lang-en");
        if (await enButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await enButton.click();
          await page.waitForTimeout(500);
        }
      }
    } catch {
      /* best effort */
    }
  });

  test("switch to Turkish then back to English", async ({ page }) => {
    await login(page);

    // Language toggle is now a dropdown — open the menu, then pick.
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await page.getByTestId("lang-toggle").waitFor({ state: "visible" });

    await page.getByTestId("lang-toggle").click();
    await page.getByTestId("lang-tr").waitFor({ state: "visible" });
    await page.getByTestId("lang-tr").click();
    // dictionaries.ts tr: dashboard="Anasayfa", matches="Maçlar"
    await expect(page.locator("body")).toContainText(/Anasayfa|Maçlar|Cüzdan|Profil/, {
      timeout: 10_000,
    });

    await page.getByTestId("lang-toggle").click();
    await page.getByTestId("lang-en").waitFor({ state: "visible" });
    await page.getByTestId("lang-en").click();
    await expect(page.locator("body")).toContainText(/Dashboard|Matches|Wallet|Profile/, {
      timeout: 10_000,
    });
  });
});
