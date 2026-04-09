import { test, expect } from "@playwright/test";
import { login, expectNoAppError } from "./helpers";

const PAGES = [
  "/dashboard",
  "/matches",
  "/wallet",
  "/stats",
  "/profile",
  "/notifications",
];

test.describe("Navigation", () => {
  test("all main pages render without application errors", async ({ page }) => {
    await login(page);

    for (const path of PAGES) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response, `no response for ${path}`).not.toBeNull();
      expect(response!.status(), `bad status for ${path}`).toBeLessThan(400);
      await expectNoAppError(page);
      await expect(page).toHaveURL(new RegExp(path.replace("/", "\\/")));
    }
  });
});
