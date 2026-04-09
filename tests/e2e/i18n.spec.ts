import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("i18n", () => {
  test("switch to Turkish then back to English", async ({ page }) => {
    await login(page);

    // Language toggle now lives on /profile (top bar was de-cluttered).
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await page.getByTestId("lang-tr").waitFor({ state: "visible" });

    await page.getByTestId("lang-tr").click();
    // dictionaries.ts tr: dashboard="Anasayfa", matches="Maçlar"
    await expect(page.locator("body")).toContainText(/Anasayfa|Maçlar|Cüzdan|Profil/, {
      timeout: 10_000,
    });

    await page.getByTestId("lang-en").click();
    await expect(page.locator("body")).toContainText(/Dashboard|Matches|Wallet|Profile/, {
      timeout: 10_000,
    });
  });
});
