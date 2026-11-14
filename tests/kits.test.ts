import { describe, expect, it } from "vitest";
import { kitSnapshot, saveKitSchema } from "../src/lib/retention/kits";
import { ApiError, handle, readJson, requireBearer } from "../src/lib/retention/core";
import { z } from "zod";

describe("saved kit snapshots", () => {
  it("preserves alternatives without trusting client lifespan, price or standards", () => {
    const base = saveKitSchema.parse({ answers: { trade: "electrician" } });
    const original = kitSnapshot(base);
    const items = original.items.map(i => ({ pick: { ...i.pick, lifespanMonths: 99999, product: { ...i.pick.product, price: 0 } } }));
    const alternative = original.items[0].alternatives[0].pick;
    items[0].pick.product.id = alternative.product.id;
    const saved = kitSnapshot(saveKitSchema.parse({ ...base, items }));
    expect(saved.items[0].pick).toEqual(alternative);
    expect(saved.items[1].pick).toEqual(original.items[1].pick);
  });
  it("rejects unknown trades, invalid hours and invented selections", () => {
    expect(saveKitSchema.safeParse({ answers: { trade: "unknown" } }).success).toBe(false);
    expect(saveKitSchema.safeParse({ answers: { trade: "electrician", hoursPerWeek: -1 } }).success).toBe(false);
    const base = saveKitSchema.parse({ answers: { trade: "electrician" } });
    const items = kitSnapshot(base).items.map(() => ({ pick: { product: { id: "fake" } } }));
    expect(() => kitSnapshot({ ...base, items })).toThrow(ApiError);
  });
});
describe("request boundaries", () => {
  it("rejects malformed and oversized streamed JSON", async () => {
    for (const [body, status] of [["{",400], [JSON.stringify("a".repeat(140000)),413]] as const) {
      const req = new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body });
      const res = await handle(async () => { await readJson(req, z.unknown()); return Response.json({}); });
      expect(res.status).toBe(status);
    }
  });
  it("does not expose exception secrets", async () => {
    const res = await handle(async () => { throw new Error("secret_key_value"); });
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("secret_key_value");
  });
  it("fails closed if cron secret is not configured", () => {
    delete process.env.UNCONFIGURED_TEST_SECRET;
    expect(() => requireBearer(new Request("http://localhost"), "UNCONFIGURED_TEST_SECRET")).toThrow(ApiError);
  });
});
