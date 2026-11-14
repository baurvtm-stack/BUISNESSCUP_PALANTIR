import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as catalog } from "../src/app/api/catalog/route";
import { POST as recommend } from "../src/app/api/recommend/route";
import { GET as clickRedirect, POST as click } from "../src/app/api/click/route";
import { PRODUCTS } from "../src/data/products";
import { DEFAULT_ANSWERS, decodeAnswers } from "../src/lib/answers";
import type { CatalogRow } from "../src/lib/catalog-schema";

vi.mock("server-only", () => ({}));
const afterJobs = vi.hoisted(() => [] as Array<() => Promise<unknown>>);
vi.mock("next/server", async original => ({
  ...await original<typeof import("next/server")>(),
  after: (callback: () => Promise<unknown>) => { afterJobs.push(callback); },
}));
// Next's persistent cache requires a running server. Route unit tests exercise
// cold reads; the production HTTP smoke verifies actual cached redirects.
vi.mock("next/cache", () => ({ unstable_cache: (read: () => Promise<unknown>) => read }));

const secret = "sb_secret_test_value_not_a_real_credential";
const databaseBoot: CatalogRow = {
  id: "database-only-boot", brand: "Database fixture", model: "Safety boot", category: "boots",
  gender: "men", price_usd: 173.45, price_approximate: true, last_checked: "2026-11-14",
  lifespan_months: { light: 18, moderate: 12, heavy: 8 }, sizes: ["10", "10.5"], climate: ["mild"],
  retailer_url: "https://retailer.example/boots?color=brown", source_url: "https://manufacturer.example/boot",
  quality: 7, features: ["safety_toe", "eh", "slip"], standards: ["ASTM F2413-24 I/C EH"],
};
const jsonRequest = (path: string, body: unknown) => new Request(`https://gearfit.example${path}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
function configure() {
  vi.stubEnv("SUPABASE_URL", "https://project.example");
  vi.stubEnv("SUPABASE_SECRET_KEY", secret);
}
beforeEach(() => {
  afterJobs.length = 0;
  for (const name of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "AFFILIATE_TAG", "AFFILIATE_PARAM"]) {
    vi.stubEnv(name, "");
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("backward-compatible recommendation and catalog routes", () => {
  it("returns the existing catalog envelope and product fields in offline mode", async () => {
    const response = await catalog(new Request("https://gearfit.example/api/catalog?category=boots"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["count", "hazards", "products", "trades"]);
    expect(body.count).toBe(PRODUCTS.filter((product) => product.category === "boots").length);
    expect(body.trades).toHaveLength(11);
    expect(body.hazards[0]).toEqual(expect.objectContaining({ id: expect.any(String), label: expect.any(String) }));
    expect(body.products[0]).toMatchObject({ id: expect.any(String), name: expect.any(String), price: expect.any(Number), lifespanMonths: expect.any(Number), url: expect.any(String) });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps token and kit shape with share-token round-tripping", async () => {
    const response = await recommend(jsonRequest("/api/recommend", { ...DEFAULT_ANSWERS, shoeSize: "", clothingSize: "" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["kit", "token"]);
    expect(decodeAnswers(body.token)).toMatchObject(DEFAULT_ANSWERS);
    expect(body.kit).toMatchObject({ tradeLabel: "Electrician", items: expect.any(Array), warnings: expect.any(Array), standards: expect.any(Array) });
    expect(body.kit.totals).toMatchObject({ upfront: expect.any(Number), perMonth: expect.any(Number), perYear: expect.any(Number), cheapestUpfront: expect.any(Number), cheapestPerYear: expect.any(Number) });
    expect(body.kit.items[0].pick).toMatchObject({ reasons: expect.any(Array), missing: [], why: expect.any(String) });
  });

  it("uses live database products instead of the fallback in both routes", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json([databaseBoot], { headers: { "content-range": "0-0/1" } }))));
    const listing = await (await catalog(new Request("https://gearfit.example/api/catalog"))).json();
    expect(listing.count).toBe(1);
    expect(listing.products[0].id).toBe(databaseBoot.id);
    const response = await recommend(jsonRequest("/api/recommend", DEFAULT_ANSWERS));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.kit.items).toHaveLength(1);
    expect(body.kit.items[0].pick.product.id).toBe(databaseBoot.id);
    expect(body.kit.totals.upfront).toBe(173.45);
    expect(body.kit.warnings.length).toBeGreaterThan(0);
  });

  it.each(["astronaut", "boots&category=gloves"])("rejects invalid or duplicate category %s", async (category) => {
    expect((await catalog(new Request(`https://gearfit.example/api/catalog?category=${category}`))).status).toBe(400);
  });

  it.each([
    { trade: "astronaut" }, { ...DEFAULT_ANSWERS, hoursPerWeek: 0 },
    { ...DEFAULT_ANSWERS, hoursPerWeek: "oops" }, { ...DEFAULT_ANSWERS, hoursPerWeek: 85 },
    { ...DEFAULT_ANSWERS, maxBudget: -1 }, { ...DEFAULT_ANSWERS, gender: "invalid" },
    { ...DEFAULT_ANSWERS, extraHazards: ["unknown"] }, { ...DEFAULT_ANSWERS, employer: ["unknown"] },
    { ...DEFAULT_ANSWERS, shoeSize: "<script>" }, null, [],
  ])("rejects malformed questionnaire values without contacting storage", async (answers) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await recommend(jsonRequest("/api/recommend", answers))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a redacted 503 instead of stale fallback when a configured database fails", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(secret, { status: 500 }))));
    for (const response of [await catalog(new Request("https://gearfit.example/api/catalog")), await recommend(jsonRequest("/api/recommend", DEFAULT_ANSWERS))]) {
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain(secret);
    }
  });
});

describe("click routes", () => {
  it("returns a retailer URL and explicitly reports untracked local mode", async () => {
    const response = await click(jsonRequest("/api/click", { productId: PRODUCTS[0].id }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectUrl: PRODUCTS[0].retailer_url, tracked: false });
  });

  it("logs the validated click before returning the tagged retailer URL", async () => {
    configure();
    vi.stubEnv("AFFILIATE_TAG", "gearfit-20");
    const fetch = vi.fn().mockResolvedValueOnce(Response.json([databaseBoot], { headers: { "content-range": "0-0/1" } })).mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    const response = await click(jsonRequest("/api/click", { productId: databaseBoot.id, kitId: "kit-token_123" }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.tracked).toBe(true);
    const url = new URL(result.redirectUrl);
    expect(url.origin).toBe("https://retailer.example");
    expect(url.searchParams.get("tag")).toBe("gearfit-20");
    expect(url.searchParams.get("color")).toBe("brown");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ product_id: databaseBoot.id, kit_id: "kit-token_123" });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("returns the redirect before starting analytics, then tracks through after()", async () => {
    configure();
    const fetch = vi.fn().mockResolvedValueOnce(Response.json([databaseBoot], { headers: { "content-range": "0-0/1" } })).mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    const response = await clickRedirect(new Request(`https://gearfit.example/api/click?productId=${databaseBoot.id}`));
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(databaseBoot.retailer_url);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(afterJobs).toHaveLength(1);
    await afterJobs[0]();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    {}, { productId: "../../secret" }, { productId: 3 }, { productId: "valid", kitId: {} },
    { productId: "valid", redirectUrl: "https://attacker.example" }, { productId: "valid", kitId: "x".repeat(2001) },
  ])("rejects invalid click bodies and user-supplied destinations", async (body) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await click(jsonRequest("/api/click", body))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects duplicate known parameters and ignores unknown link decorations", async () => {
    expect((await clickRedirect(new Request("https://gearfit.example/api/click?productId=a&productId=b"))).status).toBe(400);
    expect((await clickRedirect(new Request(`https://gearfit.example/api/click?productId=${PRODUCTS[0].id}&kitId=a&kitId=b`))).status).toBe(400);
    const response = await clickRedirect(new Request(`https://gearfit.example/api/click?productId=${PRODUCTS[0].id}&utm_source=email&utm_source=repeat&fbclid=tracking&url=https://attacker.example`));
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(PRODUCTS[0].retailer_url);
  });

  it("does not log unknown products and never reports success after a failed insert", async () => {
    configure();
    const fetch = vi.fn().mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([databaseBoot], { headers: { "content-range": "0-0/1" } })).mockResolvedValueOnce(new Response(`private ${secret}`, { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    expect((await click(jsonRequest("/api/click", { productId: "not-found" }))).status).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(1);
    const failure = await click(jsonRequest("/api/click", { productId: databaseBoot.id }));
    expect(failure.status).toBe(200);
    expect(await failure.json()).toEqual({ redirectUrl: databaseBoot.retailer_url, tracked: false });
  });

  it.each([404, 503, "network"] as const)("uses the bundled destination when catalog storage fails: %s", async failure => {
    configure();
    const fetch = vi.fn().mockImplementation(() => failure === "network"
      ? Promise.reject(new Error(`private ${secret}`))
      : Promise.resolve(new Response(`private ${secret}`, { status: failure })));
    vi.stubGlobal("fetch", fetch);
    const redirect = await clickRedirect(new Request(`https://gearfit.example/api/click?productId=${PRODUCTS[0].id}`));
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("Location")).toBe(PRODUCTS[0].retailer_url);
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(afterJobs[0]()).resolves.toBeUndefined();
    const response = await click(jsonRequest("/api/click", { productId: PRODUCTS[0].id }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectUrl: PRODUCTS[0].retailer_url, tracked: false });
  });

  it.each([404, 503, "network"] as const)("keeps a live product's redirect when its click insert fails: %s", async failure => {
    configure();
    const fetch = vi.fn().mockResolvedValueOnce(Response.json([databaseBoot], { headers: { "content-range": "0-0/1" } }))
      .mockImplementation(() => failure === "network"
        ? Promise.reject(new Error(`private ${secret}`))
        : Promise.resolve(new Response(`private ${secret}`, { status: failure })));
    vi.stubGlobal("fetch", fetch);
    const response = await clickRedirect(new Request(`https://gearfit.example/api/click?productId=${databaseBoot.id}&kitId=kit-123`));
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(databaseBoot.retailer_url);
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(afterJobs[0]()).resolves.toBeUndefined();
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ product_id: databaseBoot.id, kit_id: "kit-123" });
    expect(response.status).toBe(302);
  });

  it("returns 404 for unknown IDs even during an outage, without queuing an insert", async () => {
    configure();
    const fetch = vi.fn().mockRejectedValue(new Error("Database down"));
    vi.stubGlobal("fetch", fetch);
    const get = await clickRedirect(new Request("https://gearfit.example/api/click?productId=unknown-product&utm_source=email"));
    const post = await click(jsonRequest("/api/click", { productId: "unknown-product" }));
    expect(get.status).toBe(404);
    expect(post.status).toBe(404);
    expect(afterJobs).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("bounded JSON request bodies", () => {
  it.each([recommend, click])("rejects malformed, absent, declared oversized and streamed oversized JSON", async (route) => {
    expect((await route(new Request("https://gearfit.example/api", { method: "POST", body: "{bad" }))).status).toBe(400);
    expect((await route(new Request("https://gearfit.example/api", { method: "POST" }))).status).toBe(400);
    expect((await route(new Request("https://gearfit.example/api", { method: "POST", headers: { "content-length": "20000" }, body: "{}" }))).status).toBe(413);
    // No Content-Length header: the implementation must enforce the bytes actually read.
    expect((await route(new Request("https://gearfit.example/api", { method: "POST", body: JSON.stringify({ payload: "x".repeat(17000) }) }))).status).toBe(413);
  });
});
