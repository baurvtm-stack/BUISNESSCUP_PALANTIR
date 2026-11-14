import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCTS } from "@/data/products";

vi.mock("server-only", () => ({}));
const fake = vi.hoisted(() => ({ read: vi.fn(), cache: vi.fn() }));
vi.mock("@/lib/server/catalog", () => ({ getProducts: fake.read, getProduct: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: fake.cache }));

beforeEach(() => {
  vi.resetModules();
  fake.read.mockReset();
  fake.cache.mockReset().mockImplementation((read: () => Promise<unknown>) => {
    let pending: Promise<unknown> | undefined;
    return () => pending ??= read().catch(error => {
      pending = undefined;
      throw error;
    });
  });
});
afterEach(() => vi.restoreAllMocks());

describe("shared page and click catalog cache", () => {
  it("uses the same 60-second cache for catalog pages and outbound links", async () => {
    fake.read.mockResolvedValue([{ ...PRODUCTS[0], price: 99 }]);
    const { getCatalog } = await import("@/lib/server/kit-view");
    const { getClickProduct } = await import("@/lib/server/click-catalog");
    expect((await getCatalog())[0].price).toBe(99);
    expect((await getClickProduct(PRODUCTS[0].id))?.price).toBe(99);
    expect(fake.read).toHaveBeenCalledTimes(1);
    expect(fake.cache).toHaveBeenCalledTimes(1);
    expect(fake.cache).toHaveBeenCalledWith(expect.any(Function), expect.arrayContaining(["click-catalog-v1"]), { revalidate: 60 });
  });
  it("keeps snapshot fallback when the shared catalog read fails", async () => {
    fake.read.mockRejectedValue(new Error("Offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { getCatalog } = await import("@/lib/server/kit-view");
    expect(await getCatalog()).toHaveLength(PRODUCTS.length);
  });
});
