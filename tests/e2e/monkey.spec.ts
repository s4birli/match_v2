import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Light monkey test: visit major pages, capture console errors, click random
 * (but safe) buttons to surface unhandled crashes. Excludes destructive admin
 * actions (logout, archive, close-match, reset-password, etc.).
 */
const SAFE_PAGES = ["/dashboard", "/matches", "/wallet", "/stats", "/profile", "/notifications"];

const SAFE_TESTID_PATTERNS = [
  /^bottom-nav-/,
  /^nav-/,
  /^poll-vote-/,
  /^attendance-(reserve|decline)$/,
  /^attendance-reserve$/,
  /^lang-(en|tr)$/,
  /^group-switcher$/,
];

test.describe("Monkey", () => {
  test("clicking safe controls on every user page does not crash", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Ignore noisy Next.js/HMR/devtools dev logs
        if (
          /favicon|Manifest|hydration|HMR|webpack|next-route-announcer|Failed to load resource/.test(
            text,
          )
        )
          return;
        consoleErrors.push(`console.error: ${text.slice(0, 200)}`);
      }
    });

    await login(page, "user.demo@example.com");

    for (const path of SAFE_PAGES) {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");

      // Find every element with a data-testid and filter to safe ones
      const handles = await page.locator("[data-testid]").all();
      let clicks = 0;
      for (const h of handles) {
        const testId = await h.getAttribute("data-testid");
        if (!testId) continue;
        if (!SAFE_TESTID_PATTERNS.some((re) => re.test(testId))) continue;
        if (!(await h.isVisible())) continue;
        try {
          await h.click({ trial: false, timeout: 1500 });
          clicks++;
          // Small wait to let any client-side error surface
          await page.waitForTimeout(120);
        } catch {
          // ignore element-not-attached
        }
        if (clicks >= 4) break;
      }
    }

    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
});
