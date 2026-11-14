import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRADES } from "../src/data/trades";
import { PRODUCTS } from "@/data/products";
import { decodeAnswers, encodeAnswers } from "../src/lib/answers";
import {
  getKitFromCloud,
  isSafeUrl,
  resolveClick,
  saveKitToCloud,
  startCheckout,
  subscribeReminders,
} from "../src/lib/api/client";
import { recommend, withSavedChoice } from "../src/lib/engine";
import { duration, usd } from "../src/lib/format";
import { compareHref, decodeChoices, encodeChoices, goHref, kitHref, shortKitHref } from "../src/lib/kit-url";
import { buildKit, getWizardData } from "../src/lib/server/kit-view";
import type { Answers, Gender } from "../src/lib/types";
import { wearLabel, wearOf } from "../src/lib/wear";

vi.mock("server-only", () => ({}));

const base: Answers = {
  trade: "electrician",
  extraHazards: [],
  climate: "mild",
  gender: "men",
  hoursPerWeek: 40,
  budget: "balanced",
  employer: [],
};

describe("retaining a compliant saved choice", () => {
  const answers: Answers = { ...base, gender: "men", hoursPerWeek: 45, shoeSize: "10", clothingSize: "L / 32x30" };

  it.each([
    ["milwaukee-impact-cut5", 10],
    ["wolverine-floorhand-ins", 40],
  ] as const)("keeps %s after a price increase pushes it out of the shown options", (id, increase) => {
    const products = PRODUCTS.map((p) => p.id === id ? { ...p, price: p.price + increase } : p);
    const saved = PRODUCTS.find((p) => p.id === id)!;
    const item = recommend(answers, products).items.find((i) => i.category === saved.category)!;
    expect([item.pick, ...item.alternatives.map((a) => a.pick)].some((p) => p.product.id === id)).toBe(false);
    const kept = withSavedChoice(item, id, answers, products);
    expect(kept.alternatives[0]).toMatchObject({ label: "Saved choice", pick: { product: { id, price: saved.price + increase }, missing: [] } });
    expect(kept.alternatives[0].pick.why).toContain("45 h/week");
    expect(kept.alternatives[0].pick.costPerMonth).toBeCloseTo((saved.price + increase) / kept.alternatives[0].pick.lifespanMonths, 2);
  });

  it("rejects missing products and mismatched category, standards, gender or size", () => {
    const item = recommend(answers).items.find((i) => i.category === "boots")!;
    const product = { ...item.pick.product, id: "old-saved-boot" };
    for (const candidate of [
      { ...product, category: "gloves" as const },
      { ...product, standards: [] },
      { ...product, gender: "women" as const },
      { ...product, sizes: ["1"] },
    ]) expect(withSavedChoice(item, product.id, answers, [candidate])).toBe(item);
    expect(withSavedChoice(item, "missing", answers, PRODUCTS)).toBe(item);
    expect(withSavedChoice(item, undefined, answers, PRODUCTS)).toBe(item);
    expect(withSavedChoice(item, item.pick.product.id, answers, PRODUCTS)).toBe(item);
  });

  it("includes a retained choice before computing pros/cons and leaves empty keep unchanged", async () => {
    const original = await buildKit(answers, { live: false });
    expect(await buildKit(answers, { live: false, keep: [] })).toEqual(original);
    const item = recommend(answers).items[0];
    const extra = PRODUCTS.find((p) => p.category === item.category &&
      withSavedChoice(item, p.id, answers, PRODUCTS) !== item)!;
    expect(extra).toBeDefined();
    const kept = await buildKit(answers, { live: false, keep: [extra.id] });
    expect(kept.items[0].alternatives[0]).toMatchObject({ label: "Saved choice", pick: { product: { id: extra.id } } });
    expect(kept.items[0].alternatives[0].pick.pros.length + kept.items[0].alternatives[0].pick.cons.length).toBeGreaterThan(0);
  });

  it("validates saved choices against relaxed sizes when the page relaxes an unavailable size", async () => {
    const relaxed = { ...answers, shoeSize: "99", clothingSize: "NOT-A-SIZE" };
    const unsized = { ...answers, shoeSize: undefined, clothingSize: undefined };
    const item = recommend(unsized).items[0];
    const extra = PRODUCTS.find((p) => p.category === item.category &&
      withSavedChoice(item, p.id, unsized, PRODUCTS) !== item)!;
    const kept = await buildKit(relaxed, { live: false, keep: [extra.id] });
    expect(kept.sizeNote).toBeDefined();
    expect(kept.answers).toEqual(relaxed);
    expect(kept.items[0].alternatives[0].pick.product.id).toBe(extra.id);
  });
});

describe("kit links", () => {
  it("round-trips swapped products by item position", () => {
    const raw = encodeChoices(["", "boot-a", null, "glove_b"]);
    expect(raw).toBe(",boot-a,,glove_b");
    expect(decodeChoices(raw, 5)).toEqual(["", "boot-a", "", "glove_b", ""]);
  });

  it("drops ids that are not safe product ids", () => {
    expect(encodeChoices(["../etc", "ok-1", "<script>"])).toBe(",ok-1");
    expect(decodeChoices("javascript:alert(1),ok-1", 2)).toEqual(["", "ok-1"]);
  });

  it("omits empty choices and keeps the token intact", () => {
    expect(kitHref("abc-_123")).toBe("/kit?k=abc-_123");
    expect(kitHref("abc", { choices: ["", "x1"], slug: "s1" })).toBe("/kit?k=abc&c=%2Cx1&s=s1");
  });

  it("pairs each compared kit with its own swaps", () => {
    const href = compareHref([{ token: "t1", choices: ["a"] }, { token: "t2" }]);
    const params = new URL(href, "https://gearfit.test").searchParams;
    expect(params.getAll("k")).toEqual(["t1", "t2"]);
    expect(params.getAll("c")).toEqual(["a", ""]);
    expect(compareHref(["only"])).toBe("/compare?k=only");
  });

  it("routes retailer and short links through the app", () => {
    expect(goHref("cat-boot", "kit 1")).toBe("/go/cat-boot?kit=kit%201");
    expect(shortKitHref("a/b")).toBe("/k/a%2Fb");
  });

  it("keeps questionnaire answers through the share token", () => {
    const answers: Answers = { ...base, shoeSize: "10.5", clothingSize: "L / 34x32", maxBudget: 400 };
    expect(decodeAnswers(encodeAnswers(answers))).toMatchObject(answers);
  });
});

describe("wear tracking", () => {
  const since = new Date("2026-01-01T00:00:00Z");
  const at = (months: number) => new Date(since.getTime() + months * 30.44 * 86400000);

  it("counts down from the purchase date", () => {
    const w = wearOf(12, since, at(3));
    expect(w.status).toBe("good");
    expect(w.pct).toBeCloseTo(0.25, 2);
    expect(wearLabel(w)).toBe("~9 mo left");
  });

  it("warns inside the last 15% of life, never with less than two weeks' notice", () => {
    expect(wearOf(12, since, at(10.5)).status).toBe("soon");
    expect(wearOf(2, since, at(1.6)).status).toBe("soon");
    expect(wearLabel(wearOf(2, since, at(1.6)))).toMatch(/^Replace in ~\d wk$/);
  });

  it("flags worn-out items", () => {
    const w = wearOf(6, since, at(7));
    expect(w.status).toBe("due");
    expect(w.pct).toBe(1);
    expect(wearLabel(w)).toBe("Replace now");
  });
});

describe("formatting", () => {
  it("formats money and durations for US shoppers", () => {
    expect(usd(1234)).toBe("$1,234");
    expect(usd(27.5, 2)).toBe("$27.50");
    expect(duration(1)).toBe("1 month");
    expect(duration(24)).toBe("2 years");
  });
});

describe("API client fallbacks", () => {
  const fetchMock = vi.fn();
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const html = (status: number) => new Response("<!doctype html><title>404</title>", { status, headers: { "content-type": "text/html" } });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("treats a missing route as unavailable, so pages fall back", async () => {
    fetchMock.mockResolvedValue(html(404));
    expect(await saveKitToCloud({} as never)).toMatchObject({ kind: "unavailable" });
    expect(await resolveClick({ productId: "p1" }, "/api/click?productId=p1")).toEqual({
      url: "/api/click?productId=p1",
      tracked: false,
    });
  });

  it("treats a server error as unavailable and a JSON 4xx as a message to show", async () => {
    fetchMock.mockResolvedValueOnce(json(503, { error: "Catalog is temporarily unavailable" }));
    expect(await startCheckout({ email: "a@b.co" })).toMatchObject({ kind: "unavailable" });
    fetchMock.mockResolvedValueOnce(json(429, { error: "Too many requests" }));
    expect(await subscribeReminders({ email: "a@b.co", kitSlug: "k1" })).toEqual({
      kind: "rejected",
      status: 429,
      message: "Too many requests",
    });
  });

  it("reads the click API's redirectUrl and tracked flag", async () => {
    fetchMock.mockResolvedValue(json(200, { redirectUrl: "https://www.amazon.com/dp/X?tag=gf-20", tracked: false }));
    expect(await resolveClick({ productId: "p1", kitId: "t" }, null)).toEqual({
      url: "https://www.amazon.com/dp/X?tag=gf-20",
      tracked: false,
    });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/click");
    expect(JSON.parse(init.body)).toEqual({ productId: "p1", kitId: "t" });
  });

  it("never navigates to an unsafe redirect", async () => {
    fetchMock.mockResolvedValue(json(200, { redirectUrl: "javascript:alert(1)" }));
    expect((await resolveClick({ productId: "p1" }, "/fallback")).url).toBe("/fallback");
    expect(isSafeUrl("//evil.example")).toBe(false);
    expect(isSafeUrl("/kit?k=1")).toBe(true);
  });

  it("accepts a checkout URL and a saved-kit slug in either naming style", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { url: "https://checkout.stripe.com/c/pay/cs_test_1" }));
    expect(await startCheckout({ email: "a@b.co" })).toEqual({
      kind: "ok",
      data: { url: "https://checkout.stripe.com/c/pay/cs_test_1" },
    });
    fetchMock.mockResolvedValueOnce(json(201, { data: { slug: "k7Pq2" } }));
    expect(await saveKitToCloud({} as never)).toEqual({ kind: "ok", data: { slug: "k7Pq2" } });
  });

  it("rejects a stored kit whose answers don't validate", async () => {
    fetchMock.mockResolvedValue(json(200, { slug: "k1", answers: { trade: "astronaut" } }));
    expect((await getKitFromCloud("k1")).kind).not.toBe("ok");
  });
});

describe("questionnaire sizes", () => {
  it("only offers sizes that keep boots, shirts and pants in every trade's kit", async () => {
    const { sizes } = await getWizardData();
    const genders: Gender[] = ["men", "women", "unisex"];
    for (const gender of genders) {
      expect(sizes.shoes[gender].length).toBeGreaterThan(4);
      expect(sizes.tops[gender]).toContain("L");
      expect(sizes.pants[gender].length).toBeGreaterThan(4);
    }
    for (const trade of TRADES) {
      for (const gender of genders) {
        const pants = sizes.pants[gender];
        for (const shoeSize of sizes.shoes[gender]) {
          const kit = recommend({ ...base, trade: trade.id, gender, shoeSize });
          expect(kit.items.map((i) => i.category), `${trade.id} ${gender} boots ${shoeSize}`).toContain("boots");
        }
        for (const top of sizes.tops[gender]) {
          const clothingSize = `${top} / ${pants[Math.floor(pants.length / 2)]}`;
          const kit = recommend({ ...base, trade: trade.id, gender, clothingSize });
          const categories = kit.items.map((i) => i.category);
          expect(categories, `${trade.id} ${gender} ${clothingSize}`).toEqual(expect.arrayContaining(["shirt", "pants"]));
        }
        for (const p of pants) {
          const kit = recommend({ ...base, trade: trade.id, gender, clothingSize: `${sizes.tops[gender][0]} / ${p}` });
          expect(kit.items.map((i) => i.category), `${trade.id} ${gender} pants ${p}`).toContain("pants");
        }
      }
    }
  });
});

describe("kit page sizes", () => {
  it("keeps pants in the kit when an old link only has a top size", async () => {
    const answers: Answers = { ...base, trade: "plumber", clothingSize: "L", shoeSize: "10.5" };
    expect(recommend(answers).items.map((i) => i.category)).not.toContain("pants");
    const kit = await buildKit(answers, { live: false });
    expect(kit.items.map((i) => i.category)).toContain("pants");
    expect(kit.sizeNote).toBeTruthy();
    expect(decodeAnswers(kit.token)).toMatchObject({ clothingSize: "L", shoeSize: "10.5" });
  });

  it("leaves a kit alone when every size is in stock", async () => {
    const kit = await buildKit({ ...base, shoeSize: "10.5", clothingSize: "L / 34x32" }, { live: false });
    expect(kit.sizeNote).toBeUndefined();
    expect(kit.items.map((i) => i.category)).toEqual(expect.arrayContaining(["boots", "shirt", "pants"]));
  });
});
