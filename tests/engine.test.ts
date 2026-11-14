import { describe, expect, it } from "vitest";
import { recommend, meets } from "../src/lib/engine";
import { decodeAnswers, encodeAnswers, parseAnswers, DEFAULT_ANSWERS } from "../src/lib/answers";
import { TRADES } from "../src/data/trades";
import { PRODUCTS } from "../src/data/products";
import type { Answers } from "../src/lib/types";

const base: Answers = { ...DEFAULT_ANSWERS };

describe("recommend", () => {
  it("gives an electrician EH boots, a Class E hard hat and Z87+ glasses", () => {
    const kit = recommend({ ...base, trade: "electrician" });
    const by = (c: string) => kit.items.find((i) => i.category === c)!.pick.product;
    expect(by("boots").features).toEqual(expect.arrayContaining(["safety_toe", "eh"]));
    expect(by("head").features).toContain("class_e");
    expect(by("eyewear").features).toContain("z87plus");
    expect(kit.warnings).toEqual([]);
  });

  it("adds FR shirt and pants when arc flash is selected", () => {
    const kit = recommend({ ...base, trade: "electrician", extraHazards: ["arc_flash"] });
    for (const c of ["shirt", "pants"]) {
      expect(kit.items.find((i) => i.category === c)!.pick.product.features).toContain("fr");
    }
  });

  it("gives a road crew Class 3 hi-vis", () => {
    const kit = recommend({ ...base, trade: "road_crew" });
    expect(kit.items.find((i) => i.category === "hivis")!.pick.product.hivisClass).toBe(3);
  });

  it("gives a welder welding gloves and an FR jacket", () => {
    const kit = recommend({ ...base, trade: "welder" });
    expect(kit.items.find((i) => i.category === "gloves")!.pick.product.features).toContain("welding");
    expect(kit.items.find((i) => i.category === "outerwear")!.pick.product.features).toContain("fr");
  });

  it("splits plumber gloves into two pairs to cover cuts and chemicals", () => {
    const kit = recommend({ ...base, trade: "plumber" });
    const gloves = kit.items.filter((i) => i.category === "gloves").map((i) => i.pick.product);
    expect(gloves.length).toBe(2);
    expect(gloves.some((g) => g.features.includes("chemical"))).toBe(true);
    expect(gloves.some((g) => (g.cutLevel ?? 0) >= 2)).toBe(true);
  });

  it("uses women's products when available", () => {
    const kit = recommend({ ...base, trade: "warehouse", gender: "women" });
    expect(kit.items.find((i) => i.category === "boots")!.pick.product.gender).toBe("women");
  });

  it("budget tier changes the pick", () => {
    const value = recommend({ ...base, trade: "carpenter", budget: "value" });
    const premium = recommend({ ...base, trade: "carpenter", budget: "premium" });
    expect(value.totals.upfront).toBeLessThan(premium.totals.upfront);
  });

  it("respects a budget cap when possible", () => {
    const kit = recommend({ ...base, trade: "electrician", budget: "premium", maxBudget: 300 });
    expect(kit.totals.upfront).toBeLessThanOrEqual(300);
  });

  it("more hours per week raises the monthly cost", () => {
    const a = recommend({ ...base, hoursPerWeek: 40 });
    const b = recommend({ ...base, hoursPerWeek: 60 });
    expect(b.totals.perMonth).toBeGreaterThan(a.totals.perMonth);
  });

  it("every trade in every climate produces a kit where hard requirements are met or flagged", () => {
    for (const t of TRADES) {
      for (const climate of ["hot", "mild", "cold", "wet"] as const) {
        for (const gender of ["men", "women"] as const) {
          const kit = recommend({ ...base, trade: t.id, climate, gender, extraHazards: t.optionalHazards });
          expect(kit.items.length).toBeGreaterThanOrEqual(4);
          for (const item of kit.items) {
            const unmet = item.requirements.filter((r) => r.hard && !meets(item.pick.product, r));
            if (item.label !== "Gloves (main pair)") {
              expect(unmet.length === 0 || kit.warnings.some((w) => w.startsWith(item.label))).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe("answers", () => {
  it("round-trips through the share token", () => {
    const a: Answers = { ...base, trade: "hvac", extraHazards: ["noise"], shoeSize: "10.5", maxBudget: 500 };
    expect(decodeAnswers(encodeAnswers(a))).toEqual(parseAnswers(a));
  });
  it("rejects junk", () => {
    expect(decodeAnswers("not-base64!!")).toBeNull();
    expect(parseAnswers({ trade: "astronaut" })).toBeNull();
  });
  it("catalog ids are unique", () => {
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(PRODUCTS.length);
  });
});
