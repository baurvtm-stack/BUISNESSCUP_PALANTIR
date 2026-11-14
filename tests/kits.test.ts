import { beforeEach, describe, expect, it, vi } from "vitest";
import { kitSnapshot, saveKitSchema } from "@/lib/retention/kits";
import {
  ApiError,
  handle,
  readJson,
  requireBearer,
} from "@/lib/retention/core";
import { buildKit } from "@/lib/server/kit-view";
import { POST } from "@/app/api/kits/route";
import { GET } from "@/app/api/kits/[slug]/route";
import type { Answers } from "@/lib/types";
import type { SaveKitRequest } from "@/lib/api/contract";
import { z } from "zod";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/kit-view", async (original) => {
  const real = await original<typeof import("@/lib/server/kit-view")>();
  return {
    ...real,
    buildKit: vi.fn((answers: Answers, options?: Parameters<typeof real.buildKit>[1]) =>
      real.buildKit(answers, { ...options, live: false }),
    ),
  };
});
const fake = vi.hoisted(() => ({ db: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@/lib/retention/core", async (original) => ({
  ...(await original<typeof import("@/lib/retention/core")>()),
  db: fake.db,
  rateLimit: fake.rateLimit,
}));

beforeEach(() => {
  fake.rateLimit.mockReset().mockResolvedValue(undefined);
  fake.db.mockReset();
});

describe("saved kit snapshots", () => {
  it("preserves alternatives without trusting client lifespan, price or standards", async () => {
    const base = saveKitSchema.parse({ answers: { trade: "electrician" } });
    const original = await buildKit(base.answers, { live: false });
    const alternative = original.items[0].alternatives[0].pick;
    const saved = await kitSnapshot(
      saveKitSchema.parse({
        ...base,
        choices: [alternative.product.id],
        items: [{ price: 0, lifespanMonths: 99999, standards: ["invented"] }],
      }),
    );
    expect(saved.items[0].pick).toEqual(alternative);
    expect(saved.items[1].pick).toEqual(original.items[1].pick);
    expect(Object.keys(saved.items[0]).sort()).toEqual([
      "category",
      "label",
      "pick",
    ]);
  });
  it("rejects invalid answers and choices but falls back for a stale product ID", async () => {
    expect(
      saveKitSchema.safeParse({ answers: { trade: "unknown" } }).success,
    ).toBe(false);
    expect(
      saveKitSchema.safeParse({
        answers: { trade: "electrician", hoursPerWeek: -1 },
      }).success,
    ).toBe(false);
    const base = saveKitSchema.parse({ answers: { trade: "electrician" } });
    const original = await kitSnapshot(base);
    expect(
      await kitSnapshot({ ...base, choices: ["retired-product"] }),
    ).toEqual(original);
    expect(
      await kitSnapshot({
        ...base,
        choices: [original.items[1].pick.product.id],
      }),
    ).toEqual(original);
    expect(
      saveKitSchema.safeParse({ ...base, choices: Array(21).fill("") }).success,
    ).toBe(false);
    expect(
      saveKitSchema.safeParse({ ...base, choices: ["../bad"] }).success,
    ).toBe(false);
  });
  it("uses the page's size relaxation and preserves the shopper's answers", async () => {
    const input = saveKitSchema.parse({
      answers: { trade: "plumber", clothingSize: "L", shoeSize: "10.5" },
    });
    const snapshot = await kitSnapshot(input);
    expect(snapshot.items.map((item) => item.category)).toContain("pants");
    expect(snapshot.answers).toEqual(input.answers);
  });
});

describe("saved-kit routes and the frontend request", () => {
  const slug = "KitSaved0001";
  const createdAt = "2026-11-14T10:00:00.000Z";
  const request = (body: unknown) =>
    new Request("https://gearfit.test/api/kits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  it("accepts the exact ensureCloudSlug body and loads the swap as a public snapshot", async () => {
    const answers = saveKitSchema.parse({
      answers: { trade: "plumber", clothingSize: "L / 34x32" },
    }).answers;
    const kit = await buildKit(answers, { live: false });
    const alternative = kit.items[0].alternatives[0].pick;
    const picks = kit.items.map((item, index) =>
      index === 0 ? alternative : item.pick,
    );
    const body: SaveKitRequest = {
      answers,
      token: kit.token,
      choices: [alternative.product.id],
      tradeLabel: kit.tradeLabel,
      items: kit.items.map((item, i) => ({
        category: item.category,
        label: item.label,
        productId: picks[i].product.id,
        brand: picks[i].product.brand,
        name: picks[i].product.name,
        price: picks[i].product.price,
        lifespanMonths: picks[i].lifespanMonths,
        costPerMonth: picks[i].costPerMonth,
      })),
      totals: { upfront: kit.totals.upfront, perMonth: kit.totals.perMonth },
    };
    // Tamper with display-only values: the database must still get canonical data.
    body.items[0].price = 0;
    body.items[0].lifespanMonths = 99999;
    body.totals.upfront = 0;
    let stored: Record<string, unknown> = {};
    const insert = vi.fn((row: Record<string, unknown>) => {
      stored = { ...row, slug, created_at: createdAt };
      return {
        select: () => ({ single: async () => ({ data: stored, error: null }) }),
      };
    });
    fake.db.mockReturnValue({
      from: () => ({
        insert,
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: stored, error: null }),
          }),
        }),
      }),
    });
    const saved = await POST(request(body));
    expect(saved.status).toBe(201);
    expect(await saved.json()).toEqual({ slug, createdAt });
    expect(fake.rateLimit).toHaveBeenCalledExactlyOnceWith(
      expect.any(Request),
      "kits",
      200,
    );
    expect(vi.mocked(buildKit)).toHaveBeenLastCalledWith(answers, { keep: body.choices });
    expect(insert.mock.calls[0][0]).not.toHaveProperty("token");
    const loaded = await GET(
      new Request(`https://gearfit.test/api/kits/${slug}`),
      { params: Promise.resolve({ slug }) },
    );
    expect(loaded.status).toBe(200);
    const result = await loaded.json();
    expect(result).toMatchObject({ slug, answers, createdAt });
    expect(result.items[0]).toEqual({
      category: kit.items[0].category,
      label: kit.items[0].label,
      productId: alternative.product.id,
      brand: alternative.product.brand,
      name: alternative.product.name,
      price: alternative.product.price,
      lifespanMonths: alternative.lifespanMonths,
      costPerMonth: alternative.costPerMonth,
    });
    expect(
      result.items.every((item: { productId?: string }) => !!item.productId),
    ).toBe(true);
  });
  it("returns 404 JSON for an unknown slug", async () => {
    fake.db.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    });
    const response = await GET(
      new Request("https://gearfit.test/api/kits/Unknown00001"),
      { params: Promise.resolve({ slug: "Unknown00001" }) },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Kit not found" });
  });
  it("saves stale choices successfully using the default pick", async () => {
    const input = saveKitSchema.parse({
      answers: { trade: "electrician" },
      choices: ["stale-product"],
    });
    const expected = await buildKit(input.answers, { live: false });
    const insert = vi
      .fn()
      .mockReturnValue({
        select: () => ({
          single: async () => ({
            data: { slug, created_at: createdAt },
            error: null,
          }),
        }),
      });
    fake.db.mockReturnValue({ from: () => ({ insert }) });
    expect((await POST(request(input))).status).toBe(201);
    expect(insert.mock.calls[0][0].items[0].pick).toEqual(
      expected.items[0].pick,
    );
  });
});
describe("request boundaries", () => {
  it("rejects malformed and oversized streamed JSON", async () => {
    for (const [body, status] of [
      ["{", 400],
      [JSON.stringify("a".repeat(140000)), 413],
    ] as const) {
      const req = new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const res = await handle(async () => {
        await readJson(req, z.unknown());
        return Response.json({});
      });
      expect(res.status).toBe(status);
    }
  });
  it("does not expose exception secrets", async () => {
    const res = await handle(async () => {
      throw new Error("secret_key_value");
    });
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("secret_key_value");
  });
  it("fails closed if cron secret is not configured", () => {
    delete process.env.UNCONFIGURED_TEST_SECRET;
    expect(() =>
      requireBearer(
        new Request("http://localhost"),
        "UNCONFIGURED_TEST_SECRET",
      ),
    ).toThrow(ApiError);
  });
});
