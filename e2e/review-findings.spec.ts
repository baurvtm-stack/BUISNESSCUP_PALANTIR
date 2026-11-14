import { expect, test } from "@playwright/test";

const answers = {
  trade: "electrician", gender: "men", hoursPerWeek: 45, budget: "balanced",
  climate: "mild", shoeSize: "10", clothingSize: "L / 32x30", extraHazards: [], employer: [],
};
const kitToken = Buffer.from(JSON.stringify(answers)).toString("base64url");

test.beforeEach(async ({ context, baseURL }) => {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) return;
  const origin = new URL(baseURL!).origin;
  await context.route(url => url.origin === origin, route => route.continue({
    headers: { ...route.request().headers(), "x-vercel-protection-bypass": secret },
  }));
});

test("unverified Checkout stays free and a refresh can confirm the same session", async ({ page }) => {
  let active = false;
  await page.route(url => url.pathname === "/api/subscribe", route => route.fulfill(active
    ? { json: { active: true, email: "checkout@example.com" } }
    : { status: 503, json: { error: "Unavailable" } }));
  await page.goto("/pro?status=success&session_id=cs_test_retry");
  await expect(page.getByText("We couldn't confirm the payment yet. If you were charged, refresh this page in a minute.")).toBeVisible();
  await expect(page.getByText("Payment confirmed. Welcome to Pro!")).toHaveCount(0);
  await expect(page).toHaveURL(/session_id=cs_test_retry/);
  expect(await page.evaluate(() => localStorage.getItem("gearfit.pro.v1"))).toBeNull();
  active = true;
  await page.reload();
  await expect(page.getByText("Payment confirmed. Welcome to Pro!")).toBeVisible();
  await expect(page).toHaveURL(/\/pro$/);
});

test("free reminders at the save limit create only a cloud copy", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gearfit.kits.v1", JSON.stringify(Array.from({ length: 3 }, (_, i) => ({
      id: `saved-${i}`, token: `old-token-${i}`, tradeLabel: "Electrician", createdAt: "2026-11-14",
      choices: [], items: [], totals: { upfront: 0, perMonth: 0 },
    }))));
  });
  await page.route(url => url.pathname === "/api/kits", route => route.fulfill({ status: 201, json: { slug: "CloudOnly001" } }));
  await page.route(url => url.pathname === "/api/reminders", route => {
    expect(route.request().postDataJSON().kitSlug).toBe("CloudOnly001");
    return route.fulfill({ json: { status: "pending" } });
  });
  await page.goto(`/kit?k=${kitToken}`);
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("reminders@example.com");
  await page.getByRole("button", { name: "Remind me", exact: true }).click();
  await expect(page.getByText(/Check your inbox: we sent a confirmation link/)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("gearfit.kits.v1")!).length)).toBe(3);
});
