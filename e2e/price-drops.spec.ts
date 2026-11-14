import { expect, test, type Page } from "@playwright/test";
import type { CatalogDeal } from "../src/lib/api/contract";
import type { SavedKit } from "../src/lib/saved-kits";
import type { KitResult } from "../src/lib/types";

const slug = "PriceDrop001";
const key = "p".repeat(43);
const answers = {
  trade: "electrician", gender: "men", hoursPerWeek: 45, budget: "balanced",
  climate: "mild", shoeSize: "10", clothingSize: "L / 32x30", extraHazards: [], employer: [],
};

// Exercise the real UI with deterministic Pro responses; never charge a card, send email,
// or change the target catalog. The existing judge journey covers real cloud persistence.
const fixture = test.extend<{ saved: SavedKit }>({
  saved: async ({ request, context, baseURL }, provide) => {
    const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const headers: Record<string, string> = secret ? { "x-vercel-protection-bypass": secret } : {};
    if (secret) {
      const origin = new URL(baseURL!).origin;
      await context.route(url => url.origin === origin, route => route.continue({
        headers: { ...route.request().headers(), ...headers },
      }));
    }
    const response = await request.post("/api/recommend", { data: answers, headers });
    expect(response.ok()).toBe(true);
    const { kit, token } = await response.json() as { kit: KitResult; token: string };
    const saved: SavedKit = {
      id: "price-drop-fixture", slug, token, choices: kit.items.map(() => ""),
      tradeId: "electrician", tradeLabel: kit.tradeLabel,
      createdAt: "2026-11-14T12:00:00Z", boughtAt: "2026-11-14", totals: kit.totals,
      items: kit.items.map(({ category, label, pick }) => ({
        category, label, productId: pick.product.id, brand: pick.product.brand, name: pick.product.name,
        price: pick.product.price, lifespanMonths: pick.lifespanMonths, costPerMonth: pick.costPerMonth,
      })),
    };
    await context.addInitScript(({ saved, key }) => {
      localStorage.setItem("gearfit.kits.v1", JSON.stringify([saved]));
      localStorage.setItem("gearfit.pro.v1", JSON.stringify({
        email: "shopper@example.com", activatedAt: saved.createdAt, source: "stripe",
      }));
      localStorage.setItem("gearfit.pro-access.v1", JSON.stringify(key));
    }, { saved, key });
    await provide(saved);
  },
});

const card = (page: Page) => page.getByRole("region", { name: "Deal alerts", exact: true });
const kitUrl = (saved: SavedKit) => `/kit?k=${encodeURIComponent(saved.token)}&s=${slug}`;
const drop = (saved: SavedKit): CatalogDeal => ({
  productId: saved.items[0].productId, name: saved.items[0].name,
  savedPrice: saved.items[0].price, currentPrice: saved.items[0].price - 10,
});

fixture("price drop stays visible with email alerts off and on", async ({ page, saved }, testInfo) => {
  let enabled = false;
  let deals = [drop(saved)];
  await page.route(url => url.pathname === "/api/pro", route => route.fulfill({ json: { pro: true, features: [] } }));
  await page.route(url => url.pathname === "/api/pro/deals", route => {
    if (route.request().method() === "POST") {
      enabled = route.request().postDataJSON().enabled;
      return route.fulfill({ json: { enabled } });
    }
    return route.fulfill({ json: { enabled, deals, source: "catalog_estimates" } });
  });
  await page.goto(kitUrl(saved));
  const panel = card(page);
  const toggle = panel.getByRole("switch", { name: "Deal alerts", exact: true });
  const drops = panel.getByRole("list", { name: "Catalog price drops" });
  await expect(drops.getByText(deals[0].name, { exact: true })).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await expect(drops.getByText("−$10", { exact: true })).toBeVisible();
  await expect(drops.getByRole("link", { name: "Check price", exact: true }))
    .toHaveAttribute("href", `/go/${deals[0].productId}?kit=${slug}`);
  await expect(panel.getByText(/Catalog prices are estimates/)).toBeVisible();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(drops).toBeVisible();
  await panel.screenshot({ path: testInfo.outputPath("price-drop-card.png") });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(drops).toBeVisible();

  deals = [];
  enabled = true;
  await page.reload();
  await expect(panel.getByText("No price drops since you saved this kit.", { exact: true })).toBeVisible();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(panel.getByText("No price drops since you saved this kit.", { exact: true })).toHaveCount(0);
});

fixture("My Kits shows savings and silently omits failed checks", async ({ page, saved }, testInfo) => {
  let fail = false;
  await page.route(url => url.pathname === "/api/pro/deals", route => route.fulfill(fail
    ? { status: 503, json: { error: "Temporarily unavailable" } }
    : { json: { enabled: false, deals: [drop(saved)], source: "catalog_estimates" } }));
  await page.goto("/kits");
  const badge = page.getByRole("status").filter({ hasText: "Price drop −$10" });
  await expect(badge).toBeVisible();
  await expect(page.getByRole("heading", { name: saved.tradeLabel, exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("price-drop-my-kits.png") });

  fail = true;
  const failed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/pro/deals" && response.status() === 503);
  await page.reload();
  await failed;
  await expect(page.getByRole("heading", { name: saved.tradeLabel, exact: true })).toBeVisible();
  await expect(badge).toHaveCount(0);
});

for (const [status, message] of [
  [409, "Confirm replacement reminders for this kit with your Pro email first."],
  [403, "Pro isn't active on the server yet. Refresh in a minute."],
  [503, "Deal alerts are temporarily unavailable. Please try again."],
] as const) {
  fixture(`Deal alerts preserves the ${status} state`, async ({ page, saved }) => {
    await page.route(url => url.pathname === "/api/pro", route => route.fulfill({ json: { pro: true, features: [] } }));
    await page.route(url => url.pathname === "/api/pro/deals", route => route.fulfill({ status, json: { error: "Unavailable" } }));
    await page.goto(kitUrl(saved));
    await expect(card(page)).toContainText(message);
    await expect(card(page).getByRole("list", { name: "Catalog price drops" })).toHaveCount(0);
    await expect(card(page).getByText("No price drops since you saved this kit.", { exact: true })).toHaveCount(0);
    if (status === 409) await expect(card(page).getByRole("link", { name: "Set up replacement reminders" })).toBeVisible();
  });
}
