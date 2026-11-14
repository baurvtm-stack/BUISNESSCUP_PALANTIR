import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCTS } from "@/data/products";
import type { CategoryResult } from "@/lib/types";

vi.mock("server-only", () => ({}));
const fake = vi.hoisted(() => ({ catalog: vi.fn() }));
vi.mock("@/lib/server/catalog", () => ({ getProducts: fake.catalog }));
vi.mock("@/lib/retention/core", async (original) => ({
  ...await original<typeof import("@/lib/retention/core")>(),
  rateLimit: vi.fn().mockResolvedValue(undefined),
}));
import { dispatchDealAlerts, findDeals } from "@/lib/retention/billing";
import { GET as getDeals, POST as setDeals } from "@/app/api/pro/deals/route";
import { POST as demo } from "@/app/api/cron/reminders/route";

const product = PRODUCTS[0];
const slug = "DealSaved001";
const token = "a".repeat(43);
const checkoutId = "e1b73b6b-2802-46ec-a7f2-559e2b0f93bd";
const alertId = "73b78017-20fb-4f60-a689-c632c7ee7cfa";
const snapshot = (price = product.price) => ({ pick: { product: { ...product, price } } }) as CategoryResult;
const calls: { table: string; method: string; query: URLSearchParams; body: Record<string, unknown> }[] = [];
const emails: { key: string | null; text: string; to: string[] }[] = [];
let enabled: boolean;
let confirmed: boolean;
let active: boolean;
let providerStatus: number;
let brokenTable: string | undefined;
let kitExists: boolean;
let claimed: Set<string>;
let alertCount: number;

beforeEach(() => {
  enabled = true;
  confirmed = true;
  active = true;
  kitExists = true;
  providerStatus = 200;
  brokenTable = undefined;
  claimed = new Set();
  alertCount = 1;
  calls.length = 0;
  emails.length = 0;
  fake.catalog.mockReset().mockResolvedValue([{ ...product, price: product.price - 10 }]);
  vi.stubEnv("SUPABASE_URL", "https://database.example");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_for_unit_tests_only");
  vi.stubEnv("APP_URL", "https://gearfit.example");
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FROM", "GearFit <test@example.com>");
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  vi.stubEnv("REMINDER_TEST_MODE", "true");
  // Exercise the actual Supabase client, request filters and Resend adapter with no live network.
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.hostname === "api.resend.com") {
      emails.push({ key: new Headers(init?.headers).get("idempotency-key"), text: body.text, to: body.to });
      return Response.json({}, { status: providerStatus });
    }
    const table = url.pathname.split("/").at(-1)!;
    const method = init?.method ?? "GET";
    calls.push({ table, method, query: url.searchParams, body });
    if (table === brokenTable) return Response.json({ message: "private database failure" }, { status: 503 });
    if (table === "claim_deal_delivery") {
      const key = `${body.p_alert_id}:${body.p_fingerprint}`;
      const granted = !claimed.has(key);
      claimed.add(key);
      return Response.json(granted);
    }
    if (method !== "GET") {
      if (table === "pro_deal_alerts" && typeof body.enabled === "boolean") enabled = body.enabled;
      return new Response(null, { status: method === "POST" ? 201 : 204 });
    }
    const rows: Record<string, unknown[]> = {
      pro_checkouts: [{ id: checkoutId, email: "pro@example.com" }],
      subscriptions: active ? [{ id: "sub_test", status: "active" }] : [],
      kits: kitExists ? [{ id: "kit-id", items: [snapshot()] }] : [],
      pro_deal_alerts: url.searchParams.get("enabled") === "eq.true" && !enabled ? [] : Array.from({ length: alertCount }, (_, i) => ({
        id: i === 0 ? alertId : `${alertId.slice(0, -1)}${i}`, checkout_id: checkoutId, email: "pro@example.com", kit_slug: slug, enabled,
      })),
      reminders: confirmed ? [{ id: "reminder-id", unsubscribe_token: "u".repeat(43) }] : [],
    };
    if (!(table in rows)) throw new Error(`Unexpected test request: ${table}`);
    return Response.json(rows[table]);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function request(path: string, body?: unknown, authorization = `Bearer ${token}`) {
  return new Request(`https://gearfit.example${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const demoRequest = (body: unknown = { kitSlug: slug, deals: true }, auth = "Bearer test-cron-secret") =>
  request("/api/cron/reminders", body, auth);

describe("live catalog deals", () => {
  it("compares against a supplied catalog without reading it again", async () => {
    const deals = await findDeals([snapshot()], [{ ...product, price: product.price - 5 }]);
    expect(deals[0].currentPrice).toBe(product.price - 5);
    expect(fake.catalog).not.toHaveBeenCalled();
  });
  it("uses a fresh catalog read for each comparison, even when the bundled price has not changed", async () => {
    expect(await findDeals([snapshot()])).toEqual([{
      productId: product.id, name: product.name, savedPrice: product.price, currentPrice: product.price - 10,
    }]);
    fake.catalog.mockResolvedValue([{ ...product, price: product.price - 20 }]);
    expect((await findDeals([snapshot()]))[0].currentPrice).toBe(product.price - 20);
    expect(fake.catalog).toHaveBeenCalledTimes(2);
  });
  it("uses the snapshot only when the catalog read fails", async () => {
    fake.catalog.mockRejectedValue(new Error("Database unavailable"));
    expect(await findDeals([snapshot()])).toEqual([]);
    expect((await findDeals([snapshot(product.price + 10)]))[0].currentPrice).toBe(product.price);
  });
  it.each(["same", "higher", "missing"])("does not invent a discount for a %s live price", async (kind) => {
    fake.catalog.mockResolvedValue(kind === "missing" ? [] : [{ ...product, price: product.price + (kind === "higher" ? 10 : 0) }]);
    expect(await findDeals([snapshot()])).toEqual([]);
  });
});

describe("daily deal catalog reads", () => {
  it("reads once for several alerts and refreshes on the next run", async () => {
    alertCount = 3;
    expect(await dispatchDealAlerts()).toEqual({ sent: 3, failed: 0 });
    expect(fake.catalog).toHaveBeenCalledTimes(1);
    expect(emails).toHaveLength(3);
    fake.catalog.mockResolvedValue([{ ...product, price: product.price - 20 }]);
    expect(await dispatchDealAlerts()).toEqual({ sent: 3, failed: 0 });
    expect(fake.catalog).toHaveBeenCalledTimes(2);
    expect(emails[3].text).toContain(`$${(product.price - 20).toFixed(2)}`);
  });

  it("falls back to the bundled snapshot once for all alerts", async () => {
    alertCount = 3;
    fake.catalog.mockRejectedValue(new Error("Database unavailable"));
    expect(await dispatchDealAlerts()).toEqual({ sent: 0, failed: 0 });
    expect(fake.catalog).toHaveBeenCalledTimes(1);
    expect(calls.filter(call => call.table === "reminders")).toHaveLength(3);
  });

  it("does not read the catalog when no alerts are enabled", async () => {
    enabled = false;
    expect(await dispatchDealAlerts()).toEqual({ sent: 0, failed: 0 });
    expect(fake.catalog).not.toHaveBeenCalled();
  });
});

describe("Pro deal settings", () => {
  it("enables and disables alerts with the exact checkout/email/kit consent binding", async () => {
    const on = await setDeals(request("/api/pro/deals", { kitSlug: slug, enabled: true }));
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ enabled: true });
    const consent = calls.find(call => call.table === "reminders")!;
    expect(Object.fromEntries(consent.query)).toMatchObject({
      email: "eq.pro@example.com", kit_id: "eq.kit-id", confirmed_at: "not.is.null", unsubscribed_at: "is.null",
    });
    const write = calls.find(call => call.table === "pro_deal_alerts" && call.method === "POST")!;
    expect(write.body).toEqual({ checkout_id: checkoutId, email: "pro@example.com", kit_slug: slug, enabled: true });
    confirmed = false;
    const off = await setDeals(request("/api/pro/deals", { kitSlug: slug, enabled: false }));
    expect(off.status).toBe(200);
    expect(await off.json()).toEqual({ enabled: false });
  });
  it("returns 403 for inactive Pro or a missing capability", async () => {
    active = false;
    expect((await setDeals(request("/api/pro/deals", { kitSlug: slug, enabled: true }))).status).toBe(403);
    expect((await setDeals(request("/api/pro/deals", { kitSlug: slug, enabled: true }, ""))).status).toBe(403);
    expect(calls.some(call => call.method === "POST")).toBe(false);
  });
  it("returns 409 without a confirmed, non-unsubscribed reminder and does not enable alerts", async () => {
    confirmed = false;
    const response = await setDeals(request("/api/pro/deals", { kitSlug: slug, enabled: true }));
    expect(response.status).toBe(409);
    expect(calls.some(call => call.table === "pro_deal_alerts")).toBe(false);
  });
  it("restores the switch from server settings and turns it off after consent is withdrawn", async () => {
    const response = await getDeals(request(`/api/pro/deals?kitSlug=${slug}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ enabled: true, source: "catalog_estimates", deals: [{ currentPrice: product.price - 10 }] });
    confirmed = false;
    expect(await (await getDeals(request(`/api/pro/deals?kitSlug=${slug}`))).json()).toMatchObject({ enabled: false });
  });
});

describe("deal email demo", () => {
  it("is repeatable with new delivery rows and Resend keys, and leaves real daily dedupe separate", async () => {
    for (let i = 0; i < 2; i++) {
      const response = await demo(demoRequest());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ sent: 1, failed: 0, reasons: [], deals: [{ productId: product.id }] });
    }
    const deliveries = calls.filter(call => call.table === "deal_alert_deliveries" && call.method === "POST");
    expect(deliveries).toHaveLength(2);
    expect(new Set(deliveries.map(call => call.body.fingerprint)).size).toBe(2);
    expect(deliveries.every(call => /^demo:[a-f0-9-]{36}$/.test(String(call.body.fingerprint)))).toBe(true);
    expect(calls.some(call => call.table === "claim_deal_delivery")).toBe(false);
    expect(new Set(emails.map(email => email.key)).size).toBe(2);
    expect(emails[0].to).toEqual(["pro@example.com"]);
    expect(emails[0].text).toContain(product.name);
    expect(emails[0].text).toContain(`$${(product.price - 10).toFixed(2)} (saved at $${product.price.toFixed(2)})`);
    expect(emails[0].text).toContain(`https://gearfit.example/k/${slug}`);
    expect(emails[0].text).toContain("/api/reminders/unsubscribe?token=");
    expect(await dispatchDealAlerts()).toEqual({ sent: 1, failed: 0 });
    expect(await dispatchDealAlerts()).toEqual({ sent: 0, failed: 0 });
    expect(emails).toHaveLength(3);
  });
  it.each(["no_enabled_alert", "no_confirmed_reminder", "no_active_pro", "no_price_drop"] as const)(
    "explains sent: 0 for %s without sending", async (reason) => {
      if (reason === "no_enabled_alert") enabled = false;
      if (reason === "no_confirmed_reminder") confirmed = false;
      if (reason === "no_active_pro") active = false;
      if (reason === "no_price_drop") fake.catalog.mockResolvedValue([product]);
      const response = await demo(demoRequest());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ sent: 0, failed: 0, deals: [], reasons: [reason] });
      expect(emails).toHaveLength(0);
      expect(calls.some(call => call.table === "deal_alert_deliveries")).toBe(false);
    },
  );
  it("records failed delivery without claiming that an email was sent", async () => {
    providerStatus = 503;
    const response = await demo(demoRequest());
    expect(await response.json()).toMatchObject({ sent: 0, failed: 1, reasons: ["delivery_failed"] });
    expect(calls.some(call => call.table === "deal_alert_deliveries" && call.method === "PATCH")).toBe(false);
  });
  it("requires the cron secret and explicit demo mode", async () => {
    expect((await demo(demoRequest(undefined, "Bearer wrong"))).status).toBe(401);
    vi.stubEnv("REMINDER_TEST_MODE", "false");
    expect((await demo(demoRequest())).status).toBe(403);
    expect(calls).toHaveLength(0);
    expect(emails).toHaveLength(0);
  });
  it("rejects invalid demo inputs and unknown kits", async () => {
    expect((await demo(demoRequest({ kitSlug: slug, deals: "true" }))).status).toBe(400);
    expect((await demo(demoRequest({ kitSlug: slug, deals: true, email: "arbitrary@example.com" }))).status).toBe(400);
    kitExists = false;
    expect((await demo(demoRequest())).status).toBe(404);
    expect(emails).toHaveLength(0);
  });
  it("returns a redacted failure if the database lookup fails", async () => {
    brokenTable = "kits";
    const response = await demo(demoRequest());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database failure");
    expect(emails).toHaveLength(0);
  });
});
