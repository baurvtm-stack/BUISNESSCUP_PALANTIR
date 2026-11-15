import { expect, test } from "@playwright/test";
import { encodeAnswers, parseAnswers } from "../src/lib/answers";

const answers = {
  trade: "electrician", gender: "men", hoursPerWeek: 45, budget: "balanced",
  climate: "mild", shoeSize: "10", clothingSize: "L / 32x30", extraHazards: [], employer: [],
};
const kitToken = encodeAnswers(parseAnswers(answers)!);

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

test("the emailed confirm and unsubscribe links update the kit's reminder card", async ({ page }) => {
  const email = "pro@example.com";
  const slug = "Reminder0002";
  await page.addInitScript(({ token, email, slug }) => {
    if (localStorage.getItem("gearfit.kits.v1")) return;
    localStorage.setItem("gearfit.kits.v1", JSON.stringify([{
      id: "saved-confirm", slug, token, tradeId: "electrician", tradeLabel: "Electrician",
      choices: Array(6).fill(""), createdAt: "2026-11-15", boughtAt: "2026-11-15", reminderEmail: email,
      items: [], totals: { upfront: 0, perMonth: 0 },
    }]));
  }, { token: kitToken, email, slug });
  const card = page.locator("#replacement-reminders");
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("gearfit.kits.v1") ?? "[]")[0] ?? {});

  await page.goto(`/kit?k=${kitToken}`);
  await expect(card).toContainText(`Check your inbox: we sent a confirmation link to ${email}`);

  await page.goto(`/reminders?status=confirmed&kit=${slug}`);
  await expect(page.getByRole("heading", { name: "Reminders are on", exact: true })).toBeVisible();
  await expect.poll(async () => (await stored()).reminderConfirmed).toBe(email);
  await page.getByRole("link", { name: "Open my kit", exact: true }).click();
  await expect(card).toContainText(`Reminders are on for ${email}.`);
  await expect(card.getByRole("button", { name: "Add another email", exact: true })).toBeVisible();

  await page.goto(`/reminders?status=unsubscribed&kit=${slug}`);
  await expect.poll(async () => (await stored()).reminderEmail).toBeUndefined();
  await page.getByRole("link", { name: "Open my kit", exact: true }).click();
  await expect(card.getByRole("button", { name: "Remind me", exact: true })).toBeVisible();
  await expect(card).not.toContainText("Reminders are on");
});

for (const view of ["kit", "kits"] as const) {
  test(`${view}: resend reminders and change the email after a previous signup`, async ({ page }) => {
    const email = "earlier@example.com";
    const slug = "Reminder0001";
    await page.addInitScript(({ token, email, slug }) => {
      localStorage.setItem("gearfit.kits.v1", JSON.stringify([{
        id: "saved-reminder", slug, token, tradeId: "electrician", tradeLabel: "Electrician",
        choices: Array(6).fill(""), createdAt: "2026-11-14", boughtAt: "2026-11-14", reminderEmail: email,
        items: [{ category: "boots", label: "Work boots", productId: "wolverine-floorhand-ins", brand: "Wolverine", name: "Floorhand", price: 110, lifespanMonths: 12, costPerMonth: 9.17 }],
        totals: { upfront: 110, perMonth: 9.17 },
      }]));
    }, { token: kitToken, email, slug });
    const recipients: string[] = [];
    await page.route(url => url.pathname === "/api/reminders", route => {
      const body = route.request().postDataJSON();
      expect(body.kitSlug).toBe(slug);
      recipients.push(body.email);
      return route.fulfill({ json: { status: body.email === email ? "pending" : "confirmed" } });
    });
    await page.goto("/kits");
    if (view === "kit") await page.getByRole("link", { name: "Open kit", exact: true }).click();
    else await page.getByRole("button", { name: "Reminders on", exact: true }).click();
    const reopen = page.getByRole("button", { name: "Resend or use another email", exact: true });
    const input = page.getByRole("textbox", { name: "Email", exact: true });
    await reopen.click();
    await expect(input).toHaveValue(email);
    await page.getByRole("button", { name: "Remind me", exact: true }).click();
    await expect(reopen).toBeVisible();
    await reopen.click();
    await input.fill("pro@example.com");
    await page.getByRole("button", { name: "Remind me", exact: true }).click();
    await page.getByRole("button", { name: "Add another email", exact: true }).click();
    await expect(input).toHaveValue("pro@example.com");
    expect(recipients).toEqual([email, "pro@example.com"]);
  });
}
