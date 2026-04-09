import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("i18n", () => {
  test("switch to Turkish then back to English", async ({ page }) => {
    await login(page);

    // Switch to Turkish
    await page.getByTestId("lang-tr").click();

    // dictionaries.ts tr: dashboard="Anasayfa", matches="Maçlar"
    await expect(page.locator("body")).toContainText(/Anasayfa|Maçlar|Cüzdan/, {
      timeout: 10_000,
    });

    // Switch back to English
    await page.getByTestId("lang-en").click();
    await expect(page.locator("body")).toContainText(/Dashboard|Matches|Wallet/, {
      timeout: 10_000,
    });
  });
});
