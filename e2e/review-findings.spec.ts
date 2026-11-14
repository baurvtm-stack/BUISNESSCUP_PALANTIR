import { expect, test } from "@playwright/test";

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
