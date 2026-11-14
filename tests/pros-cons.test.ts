import { describe, expect, it, vi } from "vitest";
import { TRADES } from "../src/data/trades";
import { prosAndCons, type ProsConsContext } from "../src/lib/pros-cons";
import { buildKit } from "../src/lib/server/kit-view";
import type { Answers, Climate, Gender, Pick, Product, Requirement } from "../src/lib/types";

vi.mock("server-only", () => ({}));

function pick(product: Partial<Product> & { id: string }, lifespanMonths = 12): Pick {
  const full: Product = {
    category: "boots",
    brand: "Brand",
    name: product.id,
    gender: "unisex",
    price: 100,
    lifespanMonths,
    quality: 7,
    features: [],
    standards: [],
    ...product,
  };
  return {
    product: full,
    lifespanMonths,
    costPerMonth: Math.round((full.price / lifespanMonths) * 100) / 100,
    reasons: [],
    why: "",
    missing: [],
  };
}

const ctx = (over: Partial<ProsConsContext> = {}): ProsConsContext => ({
  requirements: [],
  climate: "mild",
  gender: "men",
  optionsConsidered: 10,
  ...over,
});

describe("pros and cons", () => {
  it("ranks price, cost per month, wear life and quality among the options shown", () => {
    const [cheap, lasting] = prosAndCons(
      [pick({ id: "cheap", price: 60, quality: 5 }, 6), pick({ id: "lasting", price: 150, quality: 9 }, 24)],
      ctx(),
    );
    expect(cheap.pros).toEqual(["Lowest price: $90 below the priciest"]);
    expect(cheap.cons).toEqual([
      "Highest cost per month: $3.75 above the lowest",
      "Shortest estimated wear life: about 6 months",
      "Lowest GearFit quality score: 5/10",
    ]);
    expect(lasting.pros).toEqual([
      "Lowest cost per month: $6.25",
      "Longest estimated wear life: about 2 years",
      "Highest GearFit quality score: 9/10",
    ]);
    expect(lasting.cons).toEqual(["Highest price: $90 above the cheapest"]);
  });

  it("says nothing about a metric where every option ties", () => {
    const out = prosAndCons([pick({ id: "a" }), pick({ id: "b" }), pick({ id: "c" })], ctx());
    expect(out).toEqual([
      { pros: [], cons: [] },
      { pros: [], cons: [] },
      { pros: [], cons: [] },
    ]);
  });

  it("marks shared first and last places as ties", () => {
    const out = prosAndCons([pick({ id: "a", price: 50 }), pick({ id: "b", price: 50 }), pick({ id: "c", price: 80 })], ctx());
    expect(out[0].pros).toContain("Ties for lowest price: $30 below the priciest");
    expect(out[1].pros).toContain("Ties for lowest price: $30 below the priciest");
    expect(out[2].cons).toContain("Highest price: $30 above the cheapest");
  });

  it("compares wear life the way the page shows it, in whole months", () => {
    const out = prosAndCons([pick({ id: "a" }, 13.6), pick({ id: "b" }, 14.4)], ctx());
    expect([...out[0].pros, ...out[0].cons, ...out[1].pros, ...out[1].cons].join(" ")).not.toMatch(/wear life/);
  });

  it("puts a recommended feature first, and its absence first among the cons", () => {
    const soft: Requirement = { category: "boots", feature: "waterproof", hard: false, why: "Waterproof boots for rainy sites" };
    const [dry, wet] = prosAndCons(
      [pick({ id: "dry", price: 90, features: ["waterproof"] }), pick({ id: "wet", price: 80 })],
      ctx({ requirements: [soft], climate: "wet" }),
    );
    expect(dry.pros[0]).toBe("Waterproof: recommended for rainy weather");
    expect(wet.cons[0]).toBe("Not waterproof: recommended for rainy weather");
    expect(dry.pros.join(" ")).not.toMatch(/Also:/);
  });

  it("attributes a job hazard to the job, not the weather", () => {
    const soft: Requirement = { category: "pants", feature: "knee_pads", hard: false, why: "Knee-pad pockets" };
    const [, plain] = prosAndCons(
      [pick({ id: "pads", category: "pants", features: ["knee_pads"] }), pick({ id: "plain", category: "pants" })],
      ctx({ requirements: [soft], climate: "hot" }),
    );
    expect(plain.cons[0]).toBe("No knee-pad pockets: recommended for your job");
  });

  it("credits a rating above the required minimum, with the real numbers", () => {
    const cut: Requirement = { category: "gloves", minCut: 2, standard: "ANSI/ISEA 105", hard: true, why: "" };
    const gloves = (id: string, cutLevel: number) =>
      pick({ id, category: "gloves", cutLevel, standards: [`ANSI/ISEA 105 A${cutLevel}`] });
    const out = prosAndCons([gloves("a2", 2), gloves("a3", 3), gloves("a5", 5)], ctx({ requirements: [cut] }));
    expect(out[0].pros.join(" ")).not.toMatch(/cut/i);
    expect(out[1].pros).toContain("Cut level A3, above the A2 your job needs");
    expect(out[2].pros).toContain("Highest cut rating: A5");
  });

  it("mentions women's sizing only when the shopper asked for it and the options differ", () => {
    const options = [pick({ id: "w", gender: "women" }), pick({ id: "u", gender: "unisex" })];
    const forWomen = prosAndCons(options, ctx({ gender: "women" }));
    expect(forWomen[0].pros).toContain("Made in women's sizing");
    expect(forWomen[1].cons).toContain("Unisex sizing, not a women's fit");
    const forMen = prosAndCons(options, ctx({ gender: "men" }));
    expect(JSON.stringify(forMen)).not.toMatch(/sizing/);
    const allUnisex = prosAndCons([pick({ id: "a" }), pick({ id: "b" })], ctx({ gender: "women" }));
    expect(JSON.stringify(allUnisex)).not.toMatch(/sizing/);
  });

  it("explains a higher price that buys a multi-pack", () => {
    const out = prosAndCons(
      [pick({ id: "one", category: "gloves", price: 7 }, 1), pick({ id: "dozen", category: "gloves", price: 85, pack: "12 pairs" }, 6)],
      ctx(),
    );
    expect(out[1].cons).toContain("Highest price: $78 above the cheapest (price is for 12 pairs)");
  });

  it("never lists unrequested specialty protection or a repeated feature as an extra", () => {
    const [boot, vest, shirt] = [
      prosAndCons([pick({ id: "b", features: ["safety_toe", "composite_toe", "eh"] })], ctx())[0],
      prosAndCons([pick({ id: "v", category: "hivis", features: ["hivis"] })], ctx())[0],
      prosAndCons([pick({ id: "s", category: "shirt", features: ["fr"] })], ctx())[0],
    ];
    expect(boot.pros).toEqual(["Also: composite toe, EH rating"]);
    expect(vest.pros).toEqual([]);
    expect(shirt.pros).toEqual([]);
  });

  it("leaves out a feature every option has", () => {
    const hat = (id: string, features: Product["features"]) => pick({ id, category: "head", features });
    const out = prosAndCons([hat("a", ["class_e"]), hat("b", ["class_e", "type_2"])], ctx());
    expect(out[0].pros).toEqual([]);
    expect(out[1].pros).toEqual(["Also: Type II side impact"]);
  });

  it("says so when only one product qualifies", () => {
    const hard: Requirement = { category: "boots", feature: "eh", hard: true, why: "" };
    const [only] = prosAndCons([pick({ id: "only", features: ["eh"] })], ctx({ requirements: [hard], optionsConsidered: 1 }));
    expect(only.pros[0]).toBe("The only product in our catalog that meets every requirement for this item");
    expect(only.cons).toEqual([]);
  });
});

describe("pros and cons on real kits", () => {
  const climates: Climate[] = ["hot", "mild", "cold", "wet"];
  const genders: Gender[] = ["men", "women"];

  it("keeps every claim true to the numbers on the page, for every trade", async () => {
    let lines = 0;
    for (const trade of TRADES) {
      for (const climate of climates) {
        for (const gender of genders) {
          const answers: Answers = { trade: trade.id, extraHazards: [], climate, gender, hoursPerWeek: 45, budget: "balanced", employer: [] };
          const kit = await buildKit(answers, { live: false });
          for (const item of kit.items) {
            const options = [item.pick, ...item.alternatives.map((a) => a.pick)];
            const min = (f: (o: (typeof options)[number]) => number) => Math.min(...options.map(f));
            const max = (f: (o: (typeof options)[number]) => number) => Math.max(...options.map(f));
            for (const o of options) {
              const where = `${trade.id}/${climate}/${gender}/${o.product.id}`;
              expect(o.pros.length, where).toBeLessThanOrEqual(3);
              expect(o.cons.length, where).toBeLessThanOrEqual(3);
              expect(new Set([...o.pros, ...o.cons]).size, where).toBe(o.pros.length + o.cons.length);
              for (const line of o.pros) {
                lines++;
                if (/lowest price/i.test(line)) expect(o.product.price, where).toBe(min((x) => x.product.price));
                if (/lowest cost per month/i.test(line)) expect(o.costPerMonth, where).toBe(min((x) => x.costPerMonth));
                if (/longest estimated wear life/i.test(line)) expect(o.lifespanMonths, where).toBeGreaterThanOrEqual(max((x) => x.lifespanMonths) - 0.5);
                if (/highest GearFit quality/i.test(line)) expect(o.product.quality, where).toBe(max((x) => x.product.quality));
                if (/women's sizing/.test(line)) expect(o.product.gender, where).toBe("women");
              }
              for (const line of o.cons) {
                lines++;
                if (/highest price/i.test(line)) expect(o.product.price, where).toBe(max((x) => x.product.price));
                if (/highest cost per month/i.test(line)) expect(o.costPerMonth, where).toBe(max((x) => x.costPerMonth));
                if (/lowest GearFit quality/i.test(line)) expect(o.product.quality, where).toBe(min((x) => x.product.quality));
              }
            }
          }
        }
      }
    }
    expect(lines).toBeGreaterThan(500);
  });
});
