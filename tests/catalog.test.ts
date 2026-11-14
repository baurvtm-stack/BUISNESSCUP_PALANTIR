import { describe, expect, it } from "vitest";
import catalog from "../src/data/catalog.json";
import { catalogSchema, toProduct } from "../src/lib/catalog-schema";
import { DEFAULT_ANSWERS } from "../src/lib/answers";
import { recommend, meets } from "../src/lib/engine";
import { isAmazonUrl } from "../src/lib/retailer-links";
import { TRADES } from "../src/data/trades";

const rows = catalogSchema.parse(catalog);
const products = rows.map(toProduct);
const requiredBrands = [
  "Carhartt", "Timberland PRO", "KEEN Utility", "Red Wing", "Wolverine",
  "Ergodyne", "3M", "Mechanix Wear", "Milwaukee", "Xena",
];

describe("checked-in catalog integrity", () => {
  it("contains at least 150 unique product identities across every requested brand", () => {
    expect(rows.length).toBeGreaterThanOrEqual(150);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    const identity = rows.map((row) => [row.brand, row.model, row.gender]
      .map((value) => value.normalize("NFKC").trim().toLowerCase()).join("|"));
    expect(new Set(identity).size).toBe(rows.length);
    for (const brand of requiredBrands) expect(rows.some((row) => row.brand === brand), brand).toBe(true);
    expect(rows.filter((row) => row.brand === "Xena").every((row) => row.gender === "women")).toBe(true);
  });

  it("validates all rows, approximate prices, real calendar dates and usable size metadata", () => {
    expect(catalogSchema.safeParse(catalog).success).toBe(true);
    for (const row of rows) {
      expect(row.price_approximate, row.id).toBe(true);
      expect(row.price_usd, row.id).toBeGreaterThan(0);
      expect(row.last_checked, row.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.sizes.length, row.id).toBeGreaterThan(0);
      expect(new Set(row.sizes).size, row.id).toBe(row.sizes.length);
      expect(row.lifespan_months.light, row.id).toBeGreaterThanOrEqual(row.lifespan_months.moderate);
      expect(row.lifespan_months.moderate, row.id).toBeGreaterThanOrEqual(row.lifespan_months.heavy);
      if (row.category === "head") expect(row.lifespan_months.light, row.id).toBe(row.lifespan_months.moderate);
      if (row.category === "boots") expect(row.sizes.every((size) => /^\d+(?:\.5)?$/.test(size)), row.id).toBe(true);
    }
  });

  it("keeps source and retailer references HTTPS without credentials or placeholder hosts", () => {
    for (const row of rows) {
      for (const reference of [row.source_url, row.retailer_url]) {
        const url = new URL(reference);
        expect(url.protocol, row.id).toBe("https:");
        expect(url.username + url.password, row.id).toBe("");
        expect(url.hostname, row.id).not.toMatch(/(?:^|\.)(?:example\.(?:com|org|net)|localhost)$/);
        expect(url.hostname, row.id).toContain(".");
      }
    }
  });

  it("sends Check price to maker pages, keeping model-specific Amazon searches as documented fallbacks only", () => {
    // docs/catalog-sources.md names each fallback; update both together.
    const fallbacks = rows.filter((row) => isAmazonUrl(row.retailer_url));
    expect(fallbacks.map((row) => row.id)).toEqual(["ammex-nitrile"]);
    for (const row of fallbacks) {
      const url = new URL(row.retailer_url);
      expect(url.hostname, row.id).toBe("www.amazon.com");
      expect(url.pathname, row.id).toBe("/s");
      expect(url.searchParams.get("k"), row.id).toBe(`${row.brand} ${row.model}`);
    }
    for (const row of rows) {
      // Stored exactly as the redirect sends it: normalized, with no partner identifiers.
      expect(new URL(row.retailer_url).toString(), row.id).toBe(row.retailer_url);
      expect([...new URL(row.retailer_url).searchParams.keys()], row.id).not.toContainEqual(expect.stringMatching(/^(?:tag|ref|aff|utm_)/i));
    }
  });

  it("keeps protective features backed by recorded standard families and qualifiers", () => {
    for (const row of rows) {
      const standards = row.standards.join("; ");
      for (const feature of row.features) {
        const patterns: Record<string, RegExp> = {
          safety_toe: /\bASTM F2413\b/,
          composite_toe: /\bASTM F2413\b/,
          eh: /\bASTM F2413[^;]*\bEH\b/,
          puncture: /\bASTM F2413[^;]*\bPR\b/,
          z87plus: /\bANSI(?:\/ISEA)? Z87\.1(?:-\d{4})?\+/,
          class_e: /\bANSI(?:\/ISEA)? Z89\.1[^;]*\bClass E\b/,
          type_2: /\bANSI(?:\/ISEA)? Z89\.1[^;]*\bType (?:II|2)\b/,
          impact: /\bANSI\/ISEA 138\b/,
          fr: row.category === "outerwear" ? /\bASTM (?:F1506|D6413)\b/ : /\bASTM F1506\b/,
          chemical: /\b(?:EN (?:ISO )?374|ASTM F739)\b/,
        };
        if (patterns[feature]) expect(standards, `${row.id}: ${feature}`).toMatch(patterns[feature]);
      }
      if (row.cut_level) expect(standards, row.id).toMatch(new RegExp(`ANSI/ISEA 105[^;]*\\bA${row.cut_level}\\b`));
      if (row.hivis_class) expect(standards, row.id).toMatch(new RegExp(`ANSI/ISEA 107[^;]*Class ${row.hivis_class}\\b`));
      if (row.nrr) expect(standards, row.id).toMatch(new RegExp(`NRR ${row.nrr} dB\\b`));
    }
  });

  it("preserves the product IDs used by the existing homepage", () => {
    expect(products.some((product) => product.id === "cat-second-shift")).toBe(true);
    expect(products.some((product) => product.id === "thorogood-moc")).toBe(true);
  });
});

describe("expanded catalog recommendation coverage", () => {
  it.each(TRADES)("$id: women's US size 8 has a compliant boot and no men's substitutions", (trade) => {
    const kit = recommend({ ...DEFAULT_ANSWERS, trade: trade.id, gender: "women", shoeSize: "8" }, products);
    const boots = kit.items.find((item) => item.category === "boots");
    expect(boots, kit.warnings.join("\n")).toBeDefined();
    expect(boots!.pick.product.sizes).toContain("8");
    expect(kit.items.some((item) => item.pick.product.gender === "men")).toBe(false);
    for (const item of kit.items) {
      expect(item.requirements.filter((r) => r.hard && !meets(item.pick.product, r))).toEqual([]);
    }
  });

  it("does not fill an impossible women's size with an unrelated boot", () => {
    const kit = recommend({ ...DEFAULT_ANSWERS, gender: "women", shoeSize: "30" }, products);
    expect(kit.items.some((item) => item.category === "boots")).toBe(false);
    expect(kit.warnings.some((warning) => warning.startsWith("Work boots:") && warning.includes("missing"))).toBe(true);
  });

  it("retains only qualifying equipment when a women's kit cannot fit a tiny budget", () => {
    const kit = recommend({ ...DEFAULT_ANSWERS, trade: "carpenter", gender: "women", shoeSize: "8", maxBudget: 1 }, products);
    expect(kit.totals.upfront).toBeGreaterThan(1);
    expect(kit.warnings.some((warning) => warning.includes("above your $1 budget"))).toBe(true);
    for (const item of kit.items) expect(item.requirements.filter((r) => r.hard).every((r) => meets(item.pick.product, r))).toBe(true);
  });
});
