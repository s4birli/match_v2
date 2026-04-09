import { test, expect } from "@playwright/test";
import { login, expectNoAppError } from "./helpers";

const ROUTES = [
  { path: "/dashboard", title: /Hello|Merhaba/i },
  { path: "/matches", title: /Matches|Maçlar/i },
  { path: "/wallet", title: /Wallet|Cüzdan/i },
  { path: "/stats", title: /Stats|İstatistik/i },
  { path: "/profile", title: /Profile|Profil/i },
  { path: "/notifications", title: /Notifications|Bildirimler/i },
];

const ADMIN_ROUTES = [
  { path: "/admin/matches", title: /Manage matches|Maçlar/i },
  { path: "/admin/matches/new", title: /Create match|Maç oluştur/i },
  { path: "/admin/members", title: /Members|Üyeler/i },
  { path: "/admin/venues", title: /Venues|Mekanlar/i },
  { path: "/admin/payments", title: /Payments|Ödemeler/i },
  { path: "/admin/invites", title: /Invites|Davetler/i },
];

test.describe("Full smoke (user)", () => {
  test("every user-facing screen renders", async ({ page }) => {
    await login(page, "levent@example.com");
    for (const route of ROUTES) {
      await page.goto(route.path);
      await page.waitForLoadState("domcontentloaded");
      await expectNoAppError(page);
      const body = page.locator("body");
      await expect(body).toContainText(route.title);
    }
  });
});

test.describe("Full smoke (admin)", () => {
  test("every admin screen renders", async ({ page }) => {
    await login(page, "admin.north@example.com");
    for (const route of ADMIN_ROUTES) {
      await page.goto(route.path);
      await page.waitForLoadState("domcontentloaded");
      await expectNoAppError(page);
    }
  });
});

test.describe("Full smoke (owner)", () => {
  test("owner tenants screen renders", async ({ page }) => {
    await login(page, "owner@example.com");
    await page.goto("/owner/tenants");
    await page.waitForLoadState("domcontentloaded");
    await expectNoAppError(page);
    await expect(page.locator("body")).toContainText(/Tenants|Gruplar/i);
  });
});
