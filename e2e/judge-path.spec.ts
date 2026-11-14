import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { z } from "zod";
import { priceComparisonUrl } from "../src/lib/retailer-links";

const categories = ["Work boots", "Work pants", "Work shirt", "Gloves", "Safety glasses", "Hard hat"];
const answers = {
  trade: "electrician", gender: "men", hoursPerWeek: 45, budget: "balanced",
  climate: "mild", shoeSize: "10", clothingSize: "L / 32x30", extraHazards: [], employer: [],
};
const statsSchema = z.object({
  kitsCreated: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  clickTrackingAvailable: z.literal(true),
  reminderSignups: z.number().int().nonnegative(),
  confirmedReminders: z.number().int().nonnegative(),
  proConversions: z.number().int().nonnegative(),
  activePro: z.number().int().nonnegative(),
  stripeMode: z.literal("test"),
});

function protectionHeaders(): Record<string, string> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return secret ? { "x-vercel-protection-bypass": secret } : {};
}

async function allowPreview(context: BrowserContext, baseURL: string) {
  if (!process.env.VERCEL_AUTOMATION_BYPASS_SECRET) return;
  const origin = new URL(baseURL).origin;
  // Never attach the preview credential to a retailer or another third party.
  await context.route(url => url.origin === origin, route => route.continue({
    headers: { ...route.request().headers(), ...protectionHeaders() },
  }));
}

const kitItems = (page: Page) => page.getByRole("region", { name: "Kit items", exact: true });
const item = (page: Page, label: string) => kitItems(page).getByRole("article")
  .filter({ has: page.getByText(label, { exact: true }) });
const money = (text: string) => Number(text.match(/\$([\d,]+(?:\.\d+)?)/)?.[1].replaceAll(",", ""));

async function total(page: Page, label: "Pay today" | "Real cost of wear") {
  const text = await page.getByRole("region", { name: "Kit summary", exact: true }).innerText();
  const start = text.toLowerCase().indexOf(label.toLowerCase());
  expect(start, `Summary contains ${label}`).toBeGreaterThanOrEqual(0);
  return money(text.slice(start + label.length));
}

async function productIds(page: Page) {
  const links = kitItems(page).getByRole("link", { name: "Check price", exact: true });
  return Promise.all((await links.all()).map(async link => {
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/go\/[^/?]+/);
    return decodeURIComponent(new URL(href!, page.url()).pathname.split("/")[2]);
  }));
}

test.beforeEach(async ({ context, baseURL }) => {
  await allowPreview(context, baseURL!);
});

test("judge journey: electrician questionnaire, swap, cloud save and retailer", async ({ page, browser, request, baseURL }, testInfo) => {
  await test.step("landing loads and opens the questionnaire", async () => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Stop guessing");
    await page.getByRole("link", { name: "Build my kit, free", exact: true }).click();
    await expect(page.getByRole("heading", { name: "What's your trade?", exact: true })).toBeVisible();
  });

  await test.step("complete all five steps with the judge's answers", async () => {
    await page.getByRole("button", { name: /^Electrician Residential/ }).click();
    await expect(page.getByRole("heading", { name: "Hazards on the job", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Where and how much do you work?", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Mild Indoors/ }).click();
    const hours = page.getByRole("slider", { name: "Hours on your feet per week", exact: true });
    await hours.press("Home");
    for (let i = 0; i < 7; i++) await hours.press("ArrowRight");
    await expect(hours).toHaveValue("45");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Does your site require anything?", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Skip", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Fit and budget", exact: true })).toBeVisible();
    await page.getByRole("radio", { name: "Men's", exact: true }).click();
    await page.getByRole("combobox", { name: "Boots (US)", exact: true }).selectOption("10");
    await page.getByRole("combobox", { name: "Shirt & jacket", exact: true }).selectOption("L");
    // Observe a real, successful API recommendation, including the selected sizes/hours.
    // The preview may complete before Build is pressed, so install the listener first.
    const recommendation = page.waitForResponse(response => {
      if (new URL(response.url()).pathname !== "/api/recommend" || response.request().method() !== "POST") return false;
      const body = response.request().postDataJSON();
      return body?.clothingSize === answers.clothingSize && body?.hoursPerWeek === 45 && body?.budget === "balanced";
    });
    await page.getByRole("combobox", { name: "Pants (waist × inseam)", exact: true }).selectOption("32x30");
    await page.getByRole("button", { name: /^Best value Lowest cost/ }).click();
    await page.getByRole("button", { name: "Build my kit", exact: true }).click();
    expect((await recommendation).status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Electrician", level: 1, exact: true })).toBeVisible();
  });

  await test.step("all six categories and a positive monthly cost are visible", async () => {
    await expect(kitItems(page).getByRole("article")).toHaveCount(categories.length);
    for (const label of categories) await expect(item(page, label)).toBeVisible();
    for (const label of ["Work boots", "Gloves", "Safety glasses", "Hard hat"]) {
      await expect(item(page, label).getByText("Required", { exact: true })).toBeVisible();
    }
    await expect(page.getByText("45 h/week", { exact: true })).toBeVisible();
    await expect(page.getByText("Clothing L / 32×30", { exact: true })).toBeVisible();
    expect(await total(page, "Real cost of wear")).toBeGreaterThan(0);
    await expect(page.getByRole("region", { name: "Kit summary" })).toContainText("/mo");
  });

  await test.step("a different priced compliant swap changes the total by its price delta", async () => {
    const before = await total(page, "Pay today");
    const options = page.getByRole("radiogroup", { name: "Work boots options", exact: true });
    const selected = money(await options.getByRole("radio", { checked: true }).innerText());
    const candidates = await options.getByRole("radio", { checked: false }).all();
    let changed = false;
    for (const candidate of candidates) {
      const price = money(await candidate.innerText());
      if (price === selected) continue;
      const label = await candidate.getAttribute("aria-label");
      if (!label || !label.trim()) throw new Error("Boot swap option must have a non-empty aria-label");
      await candidate.click();
      await expect(options.getByRole("radio", { checked: true })).toHaveAttribute("aria-label", label);
      await expect.poll(() => total(page, "Pay today")).toBe(before - selected + price);
      changed = true;
      break;
    }
    expect(changed, "The catalog must offer a differently priced compliant boot alternative").toBe(true);
  });

  const chosenIds = await productIds(page);
  const savedTotal = await total(page, "Pay today");
  const savedMonthly = await total(page, "Real cost of wear");
  let slug = "";
  await test.step("Save creates a cloud kit, not just a device copy", async () => {
    const savedResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === "/api/kits" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save kit", exact: true }).click();
    const saved = await savedResponse;
    expect(saved.status(), "Cloud Save must return 201; device-only fallback does not pass").toBe(201);
    expect(saved.request().postDataJSON().answers).toMatchObject(answers);
    ({ slug } = z.object({ slug: z.string().regex(/^[A-Za-z0-9_-]{12}$/) }).parse(await saved.json()));
    await expect(page.getByText("Saved to My kits", { exact: true })).toBeVisible();
  });

  await test.step("/k/<slug> opens the same swapped kit on a fresh device", async () => {
    const fresh = await browser.newContext({ baseURL, viewport: page.viewportSize(), reducedMotion: "reduce", serviceWorkers: "block" });
    await allowPreview(fresh, baseURL!);
    try {
      const shared = await fresh.newPage();
      const read = shared.waitForResponse(response => new URL(response.url()).pathname === `/api/kits/${slug}`);
      await shared.goto(`/k/${slug}`);
      const result = await read;
      expect(result.status()).toBe(200);
      const stored = z.object({
        slug: z.string(), answers: z.object({ trade: z.string(), gender: z.string(), hoursPerWeek: z.number(), clothingSize: z.string(), budget: z.string() }),
        items: z.array(z.object({ productId: z.string(), price: z.number() })),
      }).parse(await result.json());
      expect(stored.slug).toBe(slug);
      expect(stored.answers).toMatchObject({ trade: "electrician", gender: "men", hoursPerWeek: 45, clothingSize: "L / 32x30", budget: "balanced" });
      expect(stored.items.map(product => product.productId)).toEqual(chosenIds);
      await expect(shared.getByRole("heading", { name: "Electrician", level: 1, exact: true })).toBeVisible();
      await expect(kitItems(shared).getByRole("article")).toHaveCount(categories.length);
      expect(await productIds(shared)).toEqual(chosenIds);
      await expect.poll(() => total(shared, "Pay today")).toBe(savedTotal);
      await expect.poll(() => total(shared, "Real cost of wear")).toBe(savedMonthly);
      await testInfo.attach("shared-kit", { body: await shared.screenshot(), contentType: "image/png" });
    } finally {
      await fresh.close();
    }
  });

  await test.step("Check price reaches the real catalog retailer destination", async () => {
    const catalogResponse = await request.get("/api/catalog", { headers: protectionHeaders(), maxRedirects: 0 });
    expect(catalogResponse.status()).toBe(200);
    const catalog = z.object({ products: z.array(z.object({ id: z.string(), brand: z.string(), name: z.string(), retailer_url: z.url() })) }).parse(await catalogResponse.json());
    const product = catalog.products.find(product => product.id === chosenIds[0]);
    expect(product).toBeDefined();
    const retailer = new URL(product!.retailer_url);
    expect(retailer.protocol).toBe("https:");
    expect(retailer.origin).not.toBe(new URL(baseURL!).origin);
    const redirect = await request.get(`/api/click?productId=${chosenIds[0]}&kitId=${slug}&utm_source=e2e&fbclid=e2e`, {
      headers: protectionHeaders(), maxRedirects: 0,
    });
    expect(redirect.status()).toBe(302);
    const destination = new URL(redirect.headers().location);
    if (destination.origin === retailer.origin) {
      expect(destination.pathname).toBe(retailer.pathname);
      for (const [key, value] of retailer.searchParams) {
        if (key !== (process.env.AFFILIATE_PARAM || "tag")) expect(destination.searchParams.get(key)).toBe(value);
      }
    } else {
      // A deployed target sends visitors outside the US to a US price comparison instead.
      expect(destination.href).toBe(priceComparisonUrl(product!));
    }
    // Only the final third-party document is intercepted. GearFit's /go and click
    // handlers run unchanged; retailer bot protection/outages cannot make CI flaky.
    await page.context().route(url => url.origin === destination.origin, route => route.fulfill({
      contentType: "text/html", body: "<!doctype html><title>Retailer destination reached</title>",
    }));
    const popupReady = page.waitForEvent("popup");
    const tracked = page.context().waitForEvent("response", response =>
      new URL(response.url()).pathname === "/api/click" && response.request().method() === "POST");
    await item(page, "Work boots").getByRole("link", { name: "Check price", exact: true }).click();
    const popup = await popupReady;
    try {
      const click = await tracked;
      expect(click.status()).toBe(200);
      expect(click.request().postDataJSON()).toMatchObject({ productId: chosenIds[0], kitId: slug });
      // Observe navigation itself; reading the POST body after the page leaves
      // /go races Chromium's disposal of the previous document's response body.
      await expect(popup).toHaveURL(destination.href);
      await expect(popup).toHaveTitle("Retailer destination reached");
    } finally {
      await popup.close();
    }
  });
});

test("/api/stats returns real numeric counters", async ({ request }) => {
  const response = await request.get("/api/stats", { headers: protectionHeaders(), maxRedirects: 0 });
  expect(response.status()).toBe(200);
  statsSchema.parse(await response.json());
});
