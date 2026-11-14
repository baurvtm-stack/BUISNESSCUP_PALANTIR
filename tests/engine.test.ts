import { describe, expect, it } from "vitest";
import { recommend, meets, collectRequirements, effectiveLifespan, CATEGORY_LABELS } from "../src/lib/engine";
import { decodeAnswers, encodeAnswers, parseAnswers, DEFAULT_ANSWERS } from "../src/lib/answers";
import { TRADES } from "../src/data/trades";
import { PRODUCTS } from "../src/data/products";
import type { Answers, Product } from "../src/lib/types";

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

  it.each(TRADES)("$id: all picks and alternatives meet their hard requirements in every climate", (t) => {
      for (const climate of ["hot", "mild", "cold", "wet"] as const) {
        for (const gender of ["men", "women"] as const) {
          const kit = recommend({ ...base, trade: t.id, climate, gender, extraHazards: t.optionalHazards });
          expect(kit.items.length).toBeGreaterThanOrEqual(4);
          for (const item of kit.items) {
            for (const pick of [item.pick, item.cheapest, ...item.alternatives.map((a) => a.pick)]) {
              expect(item.requirements.filter((r) => r.hard && !meets(pick.product, r))).toEqual([]);
              expect(pick.missing).toEqual([]);
              expect(pick.why.length).toBeGreaterThan(20);
            }
          }
        }
      }
  });

  it.each(TRADES)("$id: no extra hazards retains all mandatory trade requirements", (t) => {
    const answers = { ...base, trade: t.id, extraHazards: [] };
    const kit = recommend(answers);
    for (const requirement of collectRequirements(answers).filter((r) => r.hard)) {
      const satisfied = kit.items.some((item) => meets(item.pick.product, requirement));
      expect(satisfied || kit.warnings.some((warning) =>
        warning.startsWith(CATEGORY_LABELS[requirement.category]) && warning.includes("missing from the kit"))).toBe(true);
    }
  });

  it("keeps safety requirements under a tiny budget and reports the shortfall", () => {
    const kit = recommend({ ...base, maxBudget: 1 });
    expect(kit.totals.upfront).toBeGreaterThan(1);
    expect(kit.warnings.some((warning) => warning.includes("above your $1 budget"))).toBe(true);
    for (const item of kit.items) {
      expect(item.requirements.filter((r) => r.hard).every((r) => meets(item.pick.product, r))).toBe(true);
      expect(item.pick.product.price).toBe(item.cheapest.product.price);
    }
  });

  it("omits uncertified products even if every protective feature flag is set", () => {
    const catalog = PRODUCTS.map((product) => ({ ...product, standards: [] }));
    const kit = recommend(base, catalog);
    expect(kit.items.some((item) => ["boots", "head", "eyewear", "gloves"].includes(item.category))).toBe(false);
    expect(kit.warnings.some((warning) => warning.startsWith("Work boots:"))).toBe(true);
    expect(kit.warnings.some((warning) => warning.startsWith("Hard hat:"))).toBe(true);
  });

  it("does not interpret NFPA 70E text alone as an arc-rated garment certification", () => {
    const products = PRODUCTS.map((product) => product.category === "shirt"
      ? { ...product, standards: ["NFPA 70E"], features: ["fr"] as Product["features"] } : product);
    const kit = recommend({ ...base, extraHazards: ["arc_flash"] }, products);
    expect(kit.items.some((item) => item.category === "shirt")).toBe(false);
    expect(kit.warnings.some((warning) => warning.startsWith("Work shirt:"))).toBe(true);
  });

  it("splits task gloves without hiding unmet simultaneous protection", () => {
    const kit = recommend({ ...base, trade: "plumber" });
    const gloves = kit.items.filter((item) => item.category === "gloves");
    expect(gloves).toHaveLength(2);
    expect(kit.warnings.some((warning) => warning.includes("simultaneous hazards"))).toBe(true);
    for (const item of gloves) {
      expect(item.requirements.filter((r) => r.hard).every((r) => meets(item.pick.product, r))).toBe(true);
    }
  });

  it("filters women's boot sizes without substituting a men's model", () => {
    const boot: Product = {
      id: "women-fit", category: "boots", brand: "Test", name: "Certified boot", gender: "women",
      price: 100, lifespanMonths: 12, quality: 6, features: ["safety_toe", "eh"],
      standards: ["ASTM F2413-24 I/C EH"], sizes: ["7", "7.5", "8"],
    };
    const catalog = [
      ...PRODUCTS.filter((product) => product.category !== "boots"),
      boot,
      { ...boot, id: "women-wrong-size", price: 1, quality: 10, sizes: ["10"] },
      { ...boot, id: "men-cheap", gender: "men" as const, price: 1, quality: 10 },
    ];
    const kit = recommend({ ...base, gender: "women", shoeSize: "7.5" }, catalog);
    expect(kit.items.find((item) => item.category === "boots")!.pick.product.id).toBe("women-fit");
    const unavailable = recommend({ ...base, gender: "women", shoeSize: "14" }, catalog);
    expect(unavailable.items.some((item) => item.category === "boots")).toBe(false);
    expect(unavailable.warnings.some((warning) => warning.startsWith("Work boots:") && warning.includes("size"))).toBe(true);
  });

  it("does not claim a requested size when the catalog has no size evidence", () => {
    const catalog = PRODUCTS.map((product) => ({ ...product, sizes: undefined }));
    const kit = recommend({ ...base, shoeSize: "8" }, catalog);
    expect(kit.items.some((item) => item.category === "boots")).toBe(false);
  });

  it("matches a named clothing size within a combined safety-vest size", () => {
    const vest: Product = {
      id: "combined-vest", category: "hivis", brand: "Test", name: "Class 3 vest", gender: "unisex",
      price: 25, lifespanMonths: 6, quality: 5, features: ["hivis"], hivisClass: 3,
      standards: ["ANSI/ISEA 107 Type R Class 3"], sizes: ["S/M", "L/XL"],
    };
    const kit = recommend({ ...base, trade: "road_crew", clothingSize: "L" }, [vest]);
    expect(kit.items.find((item) => item.category === "hivis")?.pick.product.id).toBe("combined-vest");
  });

  it("ranks picks, cheapest and alternatives deterministically independent of database row order", () => {
    const answers = { ...base, maxBudget: 250, extraHazards: ["noise", "traffic"] };
    expect(recommend(answers, [...PRODUCTS].reverse())).toEqual(recommend(answers, PRODUCTS));
  });

  it("breaks completely equal product scores by stable product ID", () => {
    const product = PRODUCTS.find((p) => p.id === "tb-pitboss-st")!;
    const catalog = [{ ...product, id: "z-tie" }, { ...product, id: "a-tie" }];
    const kit = recommend(base, catalog);
    const boots = kit.items.find((item) => item.category === "boots")!;
    expect(boots.pick.product.id).toBe("a-tie");
    expect(boots.cheapest.product.id).toBe("a-tie");
    expect(boots.alternatives[0].pick.product.id).toBe("z-tie");
  });

  it("returns a warning for every missing category in an empty catalog", () => {
    const kit = recommend(base, []);
    expect(kit.items).toEqual([]);
    expect(kit.totals.upfront).toBe(0);
    expect(kit.warnings.length).toBeGreaterThanOrEqual(4);
    expect(kit.warnings.every((warning) => warning.includes("missing from the kit"))).toBe(true);
  });
});

describe("standards", () => {
  const product: Product = {
    id: "test", category: "boots", brand: "Test", name: "Boot", gender: "unisex", price: 100,
    lifespanMonths: 12, quality: 5, features: ["safety_toe", "eh", "puncture"], standards: ["ASTM F2413"],
  };

  it("requires EH and PR qualifiers in the certification, not just feature tags", () => {
    expect(meets(product, { category: "boots", feature: "eh", hard: true, why: "test" })).toBe(false);
    expect(meets(product, { category: "boots", feature: "puncture", hard: true, why: "test" })).toBe(false);
    const rated = { ...product, standards: ["ASTM F2413-24 I/C EH PR"] };
    expect(meets(rated, { category: "boots", feature: "eh", hard: true, why: "test" })).toBe(true);
    expect(meets(rated, { category: "boots", feature: "puncture", hard: true, why: "test" })).toBe(true);
  });

  it("requires the high-impact plus mark for safety glasses", () => {
    const glasses: Product = { ...product, category: "eyewear", features: ["z87plus"], standards: ["ANSI Z87.1"] };
    const requirement = { category: "eyewear", feature: "z87plus", hard: true, why: "test" } as const;
    expect(meets(glasses, requirement)).toBe(false);
    expect(meets({ ...glasses, standards: ["ANSI/ISEA Z87.1-2020+"] }, requirement)).toBe(true);
  });

  it("rejects contradictions between numeric rating fields and recorded standards", () => {
    const vest: Product = { ...product, category: "hivis", hivisClass: 3, standards: ["ANSI/ISEA 107 Class 2"] };
    expect(meets(vest, { category: "hivis", minHivisClass: 3, hard: true, why: "highway" })).toBe(false);
    const hearing: Product = { ...product, category: "hearing", nrr: 31, standards: ["NRR 10 dB"] };
    expect(meets(hearing, { category: "hearing", minNrr: 22, hard: true, why: "noise" })).toBe(false);
    const glove: Product = { ...product, category: "gloves", cutLevel: 5, standards: ["ANSI/ISEA 105 A1"] };
    expect(meets(glove, { category: "gloves", minCut: 4, hard: true, why: "cuts" })).toBe(false);
  });
});

describe("lifespan estimates", () => {
  const product: Product = { ...PRODUCTS[0], lifespanMonths: 12, lifespan_months: { light: 20, moderate: 12, heavy: 7 } };

  it("uses the recorded usage-intensity anchors and interpolates between them", () => {
    expect(effectiveLifespan(product, 20)).toBe(20);
    expect(effectiveLifespan(product, 30)).toBe(16);
    expect(effectiveLifespan(product, 40)).toBe(12);
    expect(effectiveLifespan(product, 50)).toBe(9.5);
    expect(effectiveLifespan(product, 60)).toBe(7);
    expect(effectiveLifespan(product, 80)).toBe(5.3);
  });

  it("does not extend headgear's planning horizon when weekly hours decrease", () => {
    const head: Product = {
      ...product, category: "head", lifespanMonths: 36,
      lifespan_months: { light: 72, moderate: 36, heavy: 24 },
    };
    for (const candidate of [head, { ...head, lifespan_months: undefined }]) {
      expect(effectiveLifespan(candidate, 5)).toBe(36);
      expect(effectiveLifespan(candidate, 20)).toBe(36);
      expect(effectiveLifespan(candidate, 40)).toBe(36);
      expect(effectiveLifespan(candidate, 60)).toBe(24);
      expect(effectiveLifespan(candidate, 80)).toBe(18);
    }
  });

  it("explains that headgear inspection and manufacturer replacement limits override estimates", () => {
    const kit = recommend({ ...base, hoursPerWeek: 10 });
    const head = kit.items.find((item) => item.category === "head")!;
    for (const pick of [head.pick, head.cheapest, ...head.alternatives.map((alternative) => alternative.pick)]) {
      expect(pick.why).toContain("Inspect before use");
      expect(pick.why).toContain("replacement limits override");
      expect(pick.lifespanMonths).toBeLessThanOrEqual(pick.product.lifespan_months!.moderate);
    }
  });

  it("never increases life as hours increase and never produces zero or non-finite costs", () => {
    for (const p of PRODUCTS) {
      let previous = Infinity;
      for (let hours = 5; hours <= 84; hours++) {
        const life = effectiveLifespan(p, hours);
        expect(life).toBeGreaterThan(0);
        expect(life).toBeLessThanOrEqual(previous);
        expect(Number.isFinite(p.price / life)).toBe(true);
        previous = life;
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
