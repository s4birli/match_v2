import { Page, expect } from "@playwright/test";

/**
 * Next.js dev server (turbopack) keeps HMR websockets open, so
 * `waitForLoadState("networkidle")` never resolves. Use DOM-readiness
 * assertions instead.
 */
export async function login(
  page: Page,
  email = "levent@example.com",
  password = "Test1234!",
) {
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
}

export async function expectNoAppError(page: Page) {
  const html = await page.content();
  expect(html).not.toContain("Application error");
  expect(html).not.toContain("500: Internal");
}
