import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCTS } from "../src/data/products";
import { catalogSchema, type CatalogRow } from "../src/lib/catalog-schema";
import { getProduct, getProducts } from "../src/lib/server/catalog";
import { logClick, outboundUrl, visitorCountry } from "../src/lib/server/clicks";
import { isAmazonUrl } from "../src/lib/retailer-links";
import { getSupabaseConfiguration, supabaseRequest } from "../src/lib/server/supabase";

vi.mock("server-only", () => ({}));

const secret = "sb_secret_test_value_not_a_real_credential";
const row: CatalogRow = {
  id: "test-boot", brand: "Test fixture", model: "Safety boot", category: "boots",
  gender: "women", price_usd: 125, price_approximate: true, last_checked: "2026-11-14",
  lifespan_months: { light: 20, moderate: 12, heavy: 8 }, sizes: ["7", "7.5", "8"],
  climate: ["mild", "wet"], retailer_url: "https://retailer.example/boot?color=brown",
  source_url: "https://manufacturer.example/boot", quality: 7,
  features: ["safety_toe", "eh", "slip", "waterproof"], standards: ["ASTM F2413-24 I/C EH"],
};

function configured() {
  vi.stubEnv("SUPABASE_URL", "https://project.example");
  vi.stubEnv("SUPABASE_SECRET_KEY", secret);
}

beforeEach(() => {
  for (const name of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "AFFILIATE_TAG", "AFFILIATE_PARAM", "VERCEL"]) {
    vi.stubEnv(name, "");
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("catalog data access", () => {
  it("uses the bundled catalog without contacting a database when credentials are absent or partial", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await getProducts()).toEqual(PRODUCTS);
    expect(await getProducts("boots")).toEqual(PRODUCTS.filter((product) => product.category === "boots"));
    expect(await getProduct(PRODUCTS[0].id)).toEqual(PRODUCTS[0]);
    expect(await getProduct("unknown-product")).toBeNull();
    vi.stubEnv("SUPABASE_URL", "https://project.example");
    expect(await getProducts()).toEqual(PRODUCTS);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps validated Postgres fields to every legacy product field", async () => {
    configured();
    const fetch = vi.fn().mockResolvedValue(Response.json([{ ...row, cut_level: null, nrr: null, hivis_class: null, note: null, pack: null }], { headers: { "content-range": "0-0/1" } }));
    vi.stubGlobal("fetch", fetch);
    const [product] = await getProducts("boots");
    expect(product).toMatchObject({ id: row.id, name: row.model, price: 125, lifespanMonths: 12, goodFor: row.climate, retailer_url: row.retailer_url });
    expect(product.nrr).toBeUndefined();
    expect(product.note).toBeUndefined();
    const [url, options] = fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe("/rest/v1/products");
    expect(new URL(url).searchParams.get("category")).toBe("eq.boots");
    expect(new URL(url).searchParams.get("order")).toBe("id.asc");
    expect(options.cache).toBe("no-store");
    expect(options.headers.get("apikey")).toBe(secret);
    expect(options.headers.has("Authorization")).toBe(false);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("fetches every page in stable ID order", async () => {
    configured();
    const first = Array.from({ length: 500 }, (_, index) => ({ ...row, id: `boot-${String(index).padStart(4, "0")}` }));
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(first, { headers: { "content-range": "0-499/501" } }))
      .mockResolvedValueOnce(Response.json([{ ...row, id: "boot-0500" }], { headers: { "content-range": "500-500/501" } }));
    vi.stubGlobal("fetch", fetch);
    const products = await getProducts();
    expect(products).toHaveLength(501);
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get("offset")).toBe("0");
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get("offset")).toBe("500");
    expect(products.at(-1)?.id).toBe("boot-0500");
  });

  it("continues after short server-capped pages and unknown totals", async () => {
    configured();
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json([{ ...row, id: "boot-a" }, { ...row, id: "boot-b" }], { headers: { "content-range": "0-1/*" } }))
      .mockResolvedValueOnce(Response.json([{ ...row, id: "boot-c" }], { headers: { "content-range": "2-2/*" } }))
      .mockResolvedValueOnce(Response.json([], { headers: { "content-range": "*/*" } }));
    vi.stubGlobal("fetch", fetch);
    expect((await getProducts()).map((product) => product.id)).toEqual(["boot-a", "boot-b", "boot-c"]);
    expect(fetch.mock.calls.map(([url]) => new URL(url).searchParams.get("offset"))).toEqual(["0", "2", "3"]);
  });

  it("does not silently substitute JSON for an unseeded or invalid configured catalog", async () => {
    configured();
    const fetch = vi.fn().mockResolvedValueOnce(Response.json([])).mockResolvedValueOnce(Response.json([{ ...row, price_usd: -2 }], { headers: { "content-range": "0-0/1" } }))
      .mockResolvedValueOnce(Response.json([row, row], { headers: { "content-range": "0-1/2" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(getProducts()).rejects.toThrow("unavailable");
    await expect(getProducts()).rejects.toThrow("unavailable");
    await expect(getProducts()).rejects.toThrow("unavailable");
  });

  it("treats a missing category or ID as empty and validates IDs before the network", async () => {
    configured();
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json([])));
    vi.stubGlobal("fetch", fetch);
    expect(await getProducts("boots")).toEqual([]);
    expect(await getProduct("not-present")).toBeNull();
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get("id")).toBe("eq.not-present");
    await expect(getProduct("boot&select=secret")).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects unsafe URLs and inconsistent lifespan estimates at the data boundary", () => {
    expect(catalogSchema.safeParse([row]).success).toBe(true);
    for (const url of ["javascript:alert(1)", "http://retailer.example/boot", "https://user:pass@retailer.example/boot"]) {
      expect(catalogSchema.safeParse([{ ...row, retailer_url: url }]).success).toBe(false);
    }
    expect(catalogSchema.safeParse([{ ...row, lifespan_months: { light: 1, moderate: 12, heavy: 20 } }]).success).toBe(false);
    expect(catalogSchema.safeParse([{ ...row, last_checked: "2026-02-30" }]).success).toBe(false);
  });
});

describe("Supabase transport and click persistence", () => {
  it("supports legacy service-role JWT headers and prefers a configured secret key", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.example/");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy.service.role.test.credential");
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    await supabaseRequest(getSupabaseConfiguration()!, "clicks", { method: "POST" });
    expect(fetch.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer legacy.service.role.test.credential");
    expect(fetch.mock.calls[0][0]).toBe("https://project.example/rest/v1/clicks");
    vi.stubEnv("SUPABASE_SECRET_KEY", secret);
    expect(getSupabaseConfiguration()?.key).toBe(secret);
  });

  it("fails closed for malformed complete configuration and redacts backend failures", async () => {
    configured();
    vi.stubEnv("SUPABASE_URL", "http://public.example");
    expect(() => getSupabaseConfiguration()).toThrow("unavailable");
    vi.stubEnv("SUPABASE_URL", "https://project.example");
    const fetch = vi.fn().mockResolvedValueOnce(new Response(`private details ${secret}`, { status: 401 }))
      .mockRejectedValueOnce(new Error(`Network failed with ${secret}`));
    vi.stubGlobal("fetch", fetch);
    for (let index = 0; index < 2; index++) {
      await expect(supabaseRequest(getSupabaseConfiguration()!, "products")).rejects.toThrow("Catalog or click storage is unavailable");
    }
  });

  it("does not fabricate local analytics, but awaits a real configured click insert", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    expect(await logClick({ productId: row.id })).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    configured();
    expect(await logClick({ productId: row.id, kitId: "kit_123-test" })).toBe(true);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://project.example/rest/v1/clicks");
    expect(options.method).toBe("POST");
    expect(options.headers.get("Prefer")).toBe("return=minimal");
    expect(JSON.parse(options.body)).toEqual({ product_id: row.id, kit_id: "kit_123-test" });
  });

  it("tags Amazon fallback links, preserving their query and encoding the affiliate value as data", () => {
    const fallback = "https://www.amazon.com/s?k=Test%20fixture%20Safety%20boot&i=fashion";
    const product = { ...PRODUCTS[0], retailer_url: fallback };
    expect(outboundUrl(product)).toBe(fallback);
    vi.stubEnv("AFFILIATE_TAG", "gearfit&redirect=https://attacker.example");
    vi.stubEnv("AFFILIATE_PARAM", "ref");
    const destination = new URL(outboundUrl(product));
    expect(destination.origin).toBe("https://www.amazon.com");
    expect(destination.pathname).toBe("/s");
    expect(destination.searchParams.get("k")).toBe("Test fixture Safety boot");
    expect(destination.searchParams.get("i")).toBe("fashion");
    expect(destination.searchParams.get("ref")).toBe("gearfit&redirect=https://attacker.example");
    expect(destination.searchParams.has("redirect")).toBe(false);
    vi.stubEnv("AFFILIATE_PARAM", "bad&parameter");
    expect(() => outboundUrl(product)).toThrow("unavailable");
  });

  it("sends manufacturer pages unchanged even when an affiliate tag is configured", () => {
    vi.stubEnv("AFFILIATE_TAG", "gearfit-20");
    // A malformed parameter only matters for links that would be tagged.
    vi.stubEnv("AFFILIATE_PARAM", "bad&parameter");
    // Lookalike hosts and other Amazon stores do not take a US partner tag.
    for (const retailer of [row.retailer_url, "https://amazon.com.retailer.example/boot", "https://www.amazon.co.uk/s?k=Safety%20boot"]) {
      expect(outboundUrl({ ...PRODUCTS[0], retailer_url: retailer })).toBe(retailer);
    }
  });

  it("sends visitors outside the US to an untagged US price comparison for the same model", () => {
    vi.stubEnv("AFFILIATE_TAG", "gearfit-20");
    for (const retailer_url of [row.retailer_url, "https://www.amazon.com/s?k=Safety%20boot"]) {
      const product = { ...PRODUCTS[0], brand: "Test & fixture", name: "Safety boot 7\"", retailer_url };
      const destination = new URL(outboundUrl(product, "KZ"));
      expect(destination.origin + destination.pathname).toBe("https://www.google.com/search");
      expect(Object.fromEntries(destination.searchParams)).toEqual({ tbm: "shop", gl: "us", hl: "en", q: 'Test & fixture Safety boot 7"' });
      const home = new URL(outboundUrl(product, "US"));
      expect(home.hostname).toBe(new URL(retailer_url).hostname);
      expect(home.searchParams.get("tag")).toBe(isAmazonUrl(retailer_url) ? "gearfit-20" : null);
      expect(outboundUrl(product, null)).toBe(home.toString());
    }
  });

  it("reads the visitor country only from Vercel's edge header", () => {
    const request = (country?: string) => new Request("https://gearfit.example/api/click", {
      headers: country === undefined ? {} : { "x-vercel-ip-country": country },
    });
    expect(visitorCountry(request("KZ"))).toBeNull();
    vi.stubEnv("VERCEL", "1");
    expect(visitorCountry(request("KZ"))).toBe("KZ");
    expect(visitorCountry(request(" us "))).toBe("US");
    for (const value of [undefined, "", "Kazakhstan", "K1"]) expect(visitorCountry(request(value)), String(value)).toBeNull();
  });
});
