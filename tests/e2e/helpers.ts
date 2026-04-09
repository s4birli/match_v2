import { Page, expect } from "@playwright/test";

/**
 * Next.js dev server (turbopack) keeps HMR websockets open, so
 * `waitForLoadState("networkidle")` never resolves. Use DOM-readiness
 * assertions instead.
 */
export async function login(
  page: Page,
  email = "user.demo@example.com",
  password = "Test1234!",
) {
  // Force English locale so tests are independent of the test machine's
  // system language and any leftover account.preferred_language state.
  await page.context().addCookies([
    { name: "locale", value: "en", url: "http://localhost:3737" },
  ]);

  // Next.js dev (turbopack) compiles on-demand, so the first request to a route
  // may take 20–30s. Use generous timeouts here and allow a retry.
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByTestId("email-input").waitFor({ state: "visible", timeout: 45_000 });
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(password);
  await page.getByTestId("login-submit").click();
  // Wait for redirect off /login
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 20_000,
  });
  // Wait for the streamed page to mount its <main> wrapper.
  await page.waitForSelector("main", { timeout: 20_000 });

  // syncActiveTenantCookie overwrites the locale cookie with the account's
  // preferred_language on every login (so a previous user's stale cookie
  // doesn't bleed through in production). Tests want a deterministic English
  // UI, so re-stamp the cookie back to "en" and reload to re-render the
  // server components in the right locale.
  await page.context().addCookies([
    { name: "locale", value: "en", url: "http://localhost:3737" },
  ]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 20_000 });
}

export async function expectNoAppError(page: Page) {
  const html = await page.content();
  expect(html).not.toContain("Application error");
  expect(html).not.toContain("500: Internal");
}
