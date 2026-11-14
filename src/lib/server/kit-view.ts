/**
 * Server-side entry point the pages use to get kits and reference data.
 * Pages never import the engine or the catalog directly, so catalog changes stay in this file.
 *
 * Kits, the catalog page and the /go hop read the live catalog (Supabase when configured).
 * If the database is down, pages fall back to the bundled snapshot instead of erroring:
 * a kit built from yesterday's prices beats an error page in front of a customer.
 * The landing page and the questionnaire use the snapshot on purpose, so they stay static.
 */
import { cache } from "react";
import { buyUrl, PRODUCTS } from "../../data/products";
import { EMPLOYER_RULES, HAZARDS } from "../../data/hazards";
import { TRADES } from "../../data/trades";
import { encodeAnswers } from "../answers";
import { CATEGORY_LABELS, describeRequirement, effectiveLifespan, recommend } from "../engine";
import type { Answers, Category, EmployerRule, Gender, KitResult, Pick, Product, Requirement } from "../types";
import { getProduct, getProducts } from "./catalog";

/** One catalog read per request, shared by generateMetadata and the page. */
const liveProducts = cache(async (): Promise<Product[]> => {
  try {
    return await getProducts();
  } catch (error) {
    console.error("GearFit: live catalog unavailable, using the bundled snapshot.", error);
    return PRODUCTS;
  }
});

export type ViewPick = Pick & { url: string };

export interface ViewItem {
  label: string;
  category: Category;
  optionsConsidered: number;
  /** True when a hazard, the climate or the employer makes this item mandatory. */
  required: boolean;
  /** Hard requirements for this item, in plain words ("EH rating", "cut level A4+"). */
  mustHave: string[];
  pick: ViewPick;
  alternatives: { label: string; pick: ViewPick }[];
}

export interface KitView {
  token: string;
  answers: Answers;
  tradeLabel: string;
  items: ViewItem[];
  totals: KitResult["totals"];
  standards: string[];
  warnings: string[];
  /** Set when the shopper's sizes would have emptied a category, so sizes were relaxed. */
  sizeNote?: string;
}

const withUrl = (pick: Pick): ViewPick => ({ ...pick, url: buyUrl(pick.product) });

/**
 * The engine drops a whole category when nothing comes in the requested size (old links,
 * or an API caller sending only "L"). A kit with no pants is worse than unsized pants,
 * so keep as many sizes as still give the full kit.
 */
function recommendWithSizes(answers: Answers, products: Product[]): { kit: KitResult; relaxed: boolean } {
  const kit = recommend(answers, products);
  if (!answers.shoeSize && !answers.clothingSize) return { kit, relaxed: false };
  const variants: Answers[] = [
    { ...answers, clothingSize: undefined },
    { ...answers, shoeSize: undefined },
    { ...answers, shoeSize: undefined, clothingSize: undefined },
  ];
  const unsized = recommend(variants[2], products);
  if (kit.items.length >= unsized.items.length) return { kit, relaxed: false };
  for (const v of variants.slice(0, 2)) {
    const candidate = recommend(v, products);
    if (candidate.items.length >= unsized.items.length) return { kit: candidate, relaxed: true };
  }
  return { kit: unsized, relaxed: true };
}

export async function buildKit(answers: Answers, { live = true }: { live?: boolean } = {}): Promise<KitView> {
  const { kit, relaxed } = recommendWithSizes(answers, live ? await liveProducts() : PRODUCTS);
  return {
    // The token keeps the shopper's own answers, so the link reads back exactly what they chose.
    token: encodeAnswers(answers),
    answers,
    tradeLabel: kit.tradeLabel,
    totals: kit.totals,
    standards: kit.standards,
    warnings: kit.warnings,
    sizeNote: relaxed
      ? "Some items don't come in the sizes you picked, so those show every size. Choose yours on the store page."
      : undefined,
    items: kit.items.map((i) => ({
      label: i.label,
      category: i.category,
      optionsConsidered: i.optionsConsidered,
      required: i.requirements.some((r) => r.hard),
      mustHave: [...new Set(i.requirements.filter((r) => r.hard).map(describeRequirement))].filter(
        (d) => d !== "rated protection",
      ),
      pick: withUrl(i.pick),
      alternatives: i.alternatives.map((a) => ({ label: a.label, pick: withUrl(a.pick) })),
    })),
  };
}

/** Product lookup for the outbound /go redirect. */
export async function findProduct(id: string): Promise<{ product: Product; url: string } | null> {
  let product: Product | null | undefined;
  try {
    product = await getProduct(id);
  } catch {
    product = PRODUCTS.find((p) => p.id === id);
  }
  return product ? { product, url: buyUrl(product) } : null;
}

export interface CatalogItem extends Product {
  url: string;
  costPerMonth: number;
  categoryLabel: string;
}

/** The catalog with cost per month at a given weekly workload (40 h by default). */
export async function getCatalog(hoursPerWeek = 40): Promise<CatalogItem[]> {
  const products = await liveProducts();
  return products.map((p) => {
    const lifespanMonths = effectiveLifespan(p, hoursPerWeek);
    return {
      ...p,
      lifespanMonths,
      url: buyUrl(p),
      costPerMonth: Math.round((p.price / lifespanMonths) * 100) / 100,
      categoryLabel: CATEGORY_LABELS[p.category],
    };
  });
}

export const CATEGORIES: { id: Category; label: string }[] = (Object.keys(CATEGORY_LABELS) as Category[]).map((id) => ({
  id,
  label: CATEGORY_LABELS[id],
}));

function effects(reqs: Requirement[]): string[] {
  return [
    ...new Set(
      reqs.map((r) => {
        const what = describeRequirement(r);
        return what === "rated protection" ? `${CATEGORY_LABELS[r.category]} (rated)` : `${CATEGORY_LABELS[r.category]}: ${what}`;
      }),
    ),
  ];
}

export interface SizeOptions {
  /** US shoe sizes most boots come in, per sizing choice. */
  shoes: Record<Gender, string[]>;
  /** Shirt and jacket sizes most shirts come in. */
  tops: Record<Gender, string[]>;
  /** Pants sizes: waist x inseam for men ("32x30"), numeric for women ("8"). */
  pants: Record<Gender, string[]>;
}

export interface WizardData {
  trades: { id: string; label: string; blurb: string; hazards: string[]; optionalHazards: string[] }[];
  hazards: { id: string; label: string; effects: string[] }[];
  employerRules: { id: EmployerRule; label: string; effects: string[] }[];
  sizes: SizeOptions;
}

const TOP_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

function sortSizes(sizes: string[]): string[] {
  const key = (s: string) => {
    const top = TOP_ORDER.indexOf(s.toUpperCase());
    if (top >= 0) return [top, 0];
    const [w, l = "0"] = s.toLowerCase().split("x");
    return [Number(w), Number(l)];
  };
  return [...sizes].sort((a, b) => {
    const [a1, a2] = key(a);
    const [b1, b2] = key(b);
    return a1 - b1 || a2 - b2;
  });
}

/**
 * Sizes offered in the questionnaire. The engine drops products that don't come in the
 * requested size, so offering a size few products carry would empty a category.
 * We list the sizes at least half of the matching products come in.
 */
function sizeOptions(products: Product[], category: Category, gender: Exclude<Gender, "unisex">): string[] {
  const pool = products.filter((p) => p.category === category && (p.gender === gender || p.gender === "unisex"));
  const counts = new Map<string, number>();
  for (const p of pool) {
    for (const size of new Set((p.sizes ?? []).flatMap((s) => s.split("/").map((x) => x.trim())))) {
      if (size && size !== "one-size") counts.set(size, (counts.get(size) ?? 0) + 1);
    }
  }
  return sortSizes([...counts].filter(([, n]) => n >= pool.length / 2).map(([size]) => size));
}

function bySizing(category: Category): Record<Gender, string[]> {
  const men = sizeOptions(PRODUCTS, category, "men");
  const women = sizeOptions(PRODUCTS, category, "women");
  return { men, women, unisex: sortSizes([...new Set([...men, ...women])]) };
}

/** Reference data for the questionnaire, with what each hazard or rule adds to the kit. */
export async function getWizardData(): Promise<WizardData> {
  return {
    trades: TRADES.map(({ id, label, blurb, hazards, optionalHazards }) => ({ id, label, blurb, hazards, optionalHazards })),
    hazards: HAZARDS.map((h) => ({ id: h.id, label: h.label, effects: effects(h.requirements.filter((r) => r.hard)) })),
    employerRules: EMPLOYER_RULES.map((r) => ({ id: r.id, label: r.label, effects: effects(r.requirements) })),
    sizes: { shoes: bySizing("boots"), tops: bySizing("shirt"), pants: bySizing("pants") },
  };
}

export async function getTrades() {
  return TRADES.map(({ id, label, blurb }) => ({ id, label, blurb }));
}

/** Real catalog numbers for the landing page. */
export async function getCatalogFacts(hoursPerWeek = 40) {
  const boots = PRODUCTS.filter((p) => p.category === "boots" && p.features.includes("safety_toe") && p.gender !== "women");
  const perMonth = (p: Product) => p.price / effectiveLifespan(p, hoursPerWeek);
  const cheapest = [...boots].sort((a, b) => a.price - b.price)[0];
  const bestValue = [...boots].sort((a, b) => perMonth(a) - perMonth(b))[0];
  const describe = (p: Product) => ({
    name: `${p.brand} ${p.name}`,
    price: p.price,
    lifespanMonths: effectiveLifespan(p, hoursPerWeek),
    perMonth: Math.round(perMonth(p) * 100) / 100,
  });
  const standards = new Set(
    PRODUCTS.flatMap((p) => p.standards)
      .map((s) => s.match(/^(ASTM [A-Z]\d+|ANSI(?:\/ISEA)? [A-Z]?\d+(?:\.\d+)?|NFPA \d+[A-Z]?)/)?.[1])
      .filter(Boolean),
  );
  return {
    products: PRODUCTS.length,
    trades: TRADES.length,
    hazards: HAZARDS.length,
    standards: standards.size,
    brands: new Set(PRODUCTS.map((p) => p.brand)).size,
    cheapBoot: cheapest ? describe(cheapest) : null,
    goodBoot: bestValue && bestValue.id !== cheapest?.id ? describe(bestValue) : null,
  };
}
