import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogDeal } from "@/lib/api/contract";
import { loadKitPriceDrops } from "@/lib/kit-price-drops";
import { formatSaving, priceDropRows } from "@/lib/price-drops";

const deal: CatalogDeal = { productId: "work-boot", name: "Work Boot", savedPrice: 150, currentPrice: 140 };
const token = "a".repeat(43);
const slug = "DealSaved001";
const status = (deals = [deal]) => Response.json({ enabled: false, deals, source: "catalog_estimates" });

describe("price drop rows", () => {
  it("formats both prices, the saving and the tracked retailer link", () => {
    expect(priceDropRows([deal], slug)).toEqual([{
      productId: deal.productId, name: deal.name, now: "now $140", was: "was $150",
      saving: "−$10", savingCents: 1000, href: "/go/work-boot?kit=DealSaved001",
    }]);
  });

  it("preserves cents and subtracts without floating point artifacts", () => {
    const [row] = priceDropRows([{ ...deal, savedPrice: 19.99, currentPrice: 19.9 }], slug);
    expect(row).toMatchObject({ now: "now $19.90", was: "was $19.99", saving: "−$0.09", savingCents: 9 });
    expect(formatSaving(100050)).toBe("−$1,000.50");
  });

  it("ignores equal prices, increases and changes smaller than a displayed cent", () => {
    expect(priceDropRows([150, 160, 149.999].map(currentPrice => ({ ...deal, currentPrice })), slug)).toEqual([]);
    expect(priceDropRows([], slug)).toEqual([]);
  });
});

describe("My Kits price drop checks", () => {
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetcher.mockReset().mockImplementation(async () => status());
    vi.stubGlobal("fetch", fetcher);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    { name: "free shopper", kits: [{ slug }], pro: false, key: token },
    { name: "device-only kits", kits: [{}, { slug: "" }], pro: true, key: token },
    { name: "missing access key", kits: [{ slug }], pro: true, key: null },
  ])("makes no requests for $name", async ({ kits, pro, key }) => {
    expect(await loadKitPriceDrops(kits, pro, key)).toEqual({});
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("checks only ten distinct cloud kits in parallel", async () => {
    const pending: ((response: Response) => void)[] = [];
    fetcher.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const slugs = Array.from({ length: 12 }, (_, i) => `DealSaved${String(i).padStart(3, "0")}`);
    const result = loadKitPriceDrops([{}, { slug: slugs[0] }, ...slugs.map(slug => ({ slug }))], true, token);
    // All ten requests start before any response is released.
    expect(pending).toHaveLength(10);
    pending.forEach(resolve => resolve(status()));
    expect(await result).toEqual(Object.fromEntries(slugs.slice(0, 10).map(slug => [slug, 1000])));
    expect(fetcher).toHaveBeenCalledTimes(10);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { Authorization: `Bearer ${token}` } });
  });

  it("sums the drops even when the email switch is off", async () => {
    fetcher.mockResolvedValue(status([deal, { ...deal, productId: "gloves", savedPrice: 19.99, currentPrice: 19.9 }]));
    expect(await loadKitPriceDrops([{ slug }], true, token)).toEqual({ [slug]: 1009 });
  });

  it("silently omits errors and empty responses without hiding other kits' drops", async () => {
    fetcher.mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ error: "Inactive" }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ deals: "invalid" }))
      .mockResolvedValueOnce(status([]));
    const kits = Array.from({ length: 6 }, (_, i) => ({ slug: `DealSaved00${i}` }));
    expect(await loadKitPriceDrops(kits, true, token)).toEqual({ DealSaved005: 1000 });
  });

  it("uses the existing client timeout for stalled requests", async () => {
    vi.useFakeTimers();
    fetcher.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
    }));
    const result = loadKitPriceDrops([{ slug }], true, token);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await result).toEqual({});
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
