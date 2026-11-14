import { CLIMATE_REQUIREMENTS, EMPLOYER_RULES, hazardById } from "../data/hazards";
import { PRODUCTS } from "../data/products";
import { tradeById } from "../data/trades";
import type {
  Answers,
  BudgetTier,
  Category,
  CategoryResult,
  KitResult,
  Pick,
  Product,
  Requirement,
} from "./types";

export const CATEGORY_LABELS: Record<Category, string> = {
  boots: "Work boots",
  gloves: "Gloves",
  eyewear: "Safety glasses",
  hearing: "Hearing protection",
  head: "Hard hat",
  hivis: "Hi-vis",
  outerwear: "Jacket",
  shirt: "Work shirt",
  pants: "Work pants",
};

export const CATEGORY_ORDER: Category[] = [
  "boots", "pants", "shirt", "gloves", "eyewear", "hearing", "head", "hivis", "outerwear",
];

/** Categories every kit gets, even with no specific hazard. */
const CORE: Category[] = ["boots", "pants", "shirt", "gloves"];

const SPECIALTY = ["welding", "chemical", "fr"] as const;

const WEIGHTS: Record<BudgetTier, { price: number; monthly: number; quality: number }> = {
  value: { price: 0.6, monthly: 0.25, quality: 0.15 },
  balanced: { price: 0.2, monthly: 0.5, quality: 0.3 },
  premium: { price: 0.05, monthly: 0.25, quality: 0.7 },
};

export function meets(product: Product, req: Requirement): boolean {
  if (product.category !== req.category) return false;
  if (req.feature && !product.features.includes(req.feature)) return false;
  if (req.minCut && (product.cutLevel ?? 0) < req.minCut) return false;
  if (req.minNrr && (product.nrr ?? 0) < req.minNrr) return false;
  if (req.minHivisClass && (product.hivisClass ?? 0) < req.minHivisClass) return false;
  return true;
}

export function describeRequirement(req: Requirement): string {
  if (req.minCut) return `cut level A${req.minCut}+`;
  if (req.minNrr) return `NRR ${req.minNrr}+ dB`;
  if (req.minHivisClass) return `Class ${req.minHivisClass}+ hi-vis`;
  const names: Record<string, string> = {
    safety_toe: "safety toe", composite_toe: "composite toe", eh: "EH rating", puncture: "puncture plate",
    slip: "slip-resistant sole", waterproof: "waterproof", insulated: "insulated", impact: "impact guards",
    welding: "welding-rated", chemical: "chemical resistant", touchscreen: "touchscreen",
    z87plus: "Z87.1+ impact rating", anti_fog: "anti-fog", tinted: "tinted lens", electronic: "electronic",
    bluetooth: "Bluetooth", class_e: "Class E (electrical)", type_2: "Type II side impact", fr: "flame resistant",
    hivis: "hi-vis", knee_pads: "knee-pad pockets", lightweight: "lightweight", stretch: "stretch",
  };
  if (req.feature) return names[req.feature] ?? req.feature;
  return "rated protection";
}

/** Effective service life, scaled by how many hours a week the gear is worn. */
export function effectiveLifespan(product: Product, hoursPerWeek: number): number {
  const factor = Math.min(2, Math.max(0.5, 40 / Math.max(1, hoursPerWeek)));
  return Math.round(product.lifespanMonths * factor * 10) / 10;
}

function genderOk(product: Product, gender: Answers["gender"]): boolean {
  if (gender === "unisex" || product.gender === "unisex") return true;
  return product.gender === gender;
}

/** Collects every requirement implied by the trade, extra hazards, climate and employer rules. */
export function collectRequirements(answers: Answers): Requirement[] {
  const trade = tradeById(answers.trade);
  const hazardIds = new Set([...(trade?.hazards ?? []), ...answers.extraHazards]);
  const reqs: Requirement[] = [];
  for (const id of hazardIds) reqs.push(...(hazardById(id)?.requirements ?? []));
  reqs.push(...CLIMATE_REQUIREMENTS[answers.climate]);
  for (const rule of EMPLOYER_RULES) {
    if (answers.employer.includes(rule.id)) reqs.push(...rule.requirements);
  }
  return dedupe(reqs);
}

function dedupe(reqs: Requirement[]): Requirement[] {
  const byKey = new Map<string, Requirement>();
  for (const r of reqs) {
    const key = `${r.category}|${r.feature ?? ""}|${r.minCut ? "cut" : ""}|${r.minNrr ? "nrr" : ""}|${r.minHivisClass ? "hv" : ""}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, r);
      continue;
    }
    // Keep the strictest threshold and promote to hard if either is hard.
    byKey.set(key, {
      ...prev,
      minCut: Math.max(prev.minCut ?? 0, r.minCut ?? 0) || undefined,
      minNrr: Math.max(prev.minNrr ?? 0, r.minNrr ?? 0) || undefined,
      minHivisClass: (Math.max(prev.minHivisClass ?? 0, r.minHivisClass ?? 0) || undefined) as 2 | 3 | undefined,
      hard: prev.hard || r.hard,
      why: prev.hard || !r.hard ? prev.why : r.why,
    });
  }
  return [...byKey.values()];
}

function makePick(product: Product, reqs: Requirement[], hoursPerWeek: number): Pick {
  const life = effectiveLifespan(product, hoursPerWeek);
  return {
    product,
    lifespanMonths: life,
    costPerMonth: round2(product.price / life),
    reasons: reqs.filter((r) => meets(product, r)).map((r) => `${capitalize(describeRequirement(r))}: ${r.why}`),
    missing: reqs.filter((r) => r.hard && !meets(product, r)).map((r) => describeRequirement(r)),
  };
}

function scoreAll(
  pool: Product[],
  reqs: Requirement[],
  answers: Answers,
): { product: Product; score: number }[] {
  const w = WEIGHTS[answers.budget];
  const prices = pool.map((p) => p.price);
  const monthly = pool.map((p) => p.price / effectiveLifespan(p, answers.hoursPerWeek));
  const norm = (v: number, arr: number[]) => {
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    return max === min ? 0.5 : (v - min) / (max - min);
  };
  const soft = reqs.filter((r) => !r.hard);
  return pool
    .map((product, i) => {
      let score =
        w.price * (1 - norm(prices[i], prices)) +
        w.monthly * (1 - norm(monthly[i], monthly)) +
        w.quality * (product.quality / 10);
      score += 0.35 * soft.filter((r) => meets(product, r)).length;
      if (product.goodFor?.includes(answers.climate)) score += 0.1;
      // Specialty gear nobody asked for (welding leather, disposable nitrile) is a poor everyday pick.
      const unneeded = SPECIALTY.filter((f) => product.features.includes(f) && !reqs.some((r) => r.feature === f));
      score -= 0.3 * unneeded.length;
      return { product, score };
    })
    .sort((a, b) => b.score - a.score || a.product.price - b.product.price);
}

function resolveCategory(category: Category, reqs: Requirement[], answers: Answers): CategoryResult | null {
  const all = PRODUCTS.filter((p) => p.category === category && genderOk(p, answers.gender));
  if (all.length === 0) return null;
  const hard = reqs.filter((r) => r.hard);
  let pool = all.filter((p) => hard.every((r) => meets(p, r)));
  if (pool.length === 0) {
    // No product meets every hard requirement: keep the ones meeting the most.
    const met = (p: Product) => hard.filter((r) => meets(p, r)).length;
    const best = Math.max(...all.map(met));
    pool = all.filter((p) => met(p) === best);
  }
  const ranked = scoreAll(pool, reqs, answers);
  const top = ranked[0].product;
  const cheapest = [...pool].sort((a, b) => a.price - b.price)[0];
  const bestValue = [...pool].sort(
    (a, b) =>
      a.price / effectiveLifespan(a, answers.hoursPerWeek) - b.price / effectiveLifespan(b, answers.hoursPerWeek),
  )[0];
  const premium = [...pool].sort((a, b) => b.quality - a.quality || b.lifespanMonths - a.lifespanMonths)[0];

  const alternatives: CategoryResult["alternatives"] = [];
  const seen = new Set([top.id]);
  for (const [label, prod] of [
    ["Lowest price", cheapest],
    ["Lowest cost per month", bestValue],
    ["Top quality", premium],
  ] as const) {
    if (!seen.has(prod.id)) {
      seen.add(prod.id);
      alternatives.push({ label, pick: makePick(prod, reqs, answers.hoursPerWeek) });
    }
  }
  for (const { product } of ranked) {
    if (alternatives.length >= 3) break;
    if (!seen.has(product.id)) {
      seen.add(product.id);
      alternatives.push({ label: "Also fits", pick: makePick(product, reqs, answers.hoursPerWeek) });
    }
  }

  return {
    category,
    label: CATEGORY_LABELS[category],
    requirements: reqs,
    pick: makePick(top, reqs, answers.hoursPerWeek),
    alternatives,
    cheapest: makePick(cheapest, reqs, answers.hoursPerWeek),
    optionsConsidered: pool.length,
  };
}

/** Swaps picks to cheaper compliant options until the kit fits the budget cap. */
function applyBudgetCap(items: CategoryResult[], cap: number): boolean {
  const total = () => items.reduce((s, i) => s + i.pick.product.price, 0);
  let guard = 50;
  while (total() > cap && guard-- > 0) {
    let bestSwap: { item: CategoryResult; pick: Pick; saving: number } | null = null;
    for (const item of items) {
      for (const alt of [item.cheapest, ...item.alternatives.map((a) => a.pick)]) {
        if (alt.missing.length > item.pick.missing.length) continue;
        const saving = item.pick.product.price - alt.product.price;
        if (saving > 0 && (!bestSwap || saving > bestSwap.saving)) bestSwap = { item, pick: alt, saving };
      }
    }
    if (!bestSwap) break;
    const { item, pick } = bestSwap;
    const old = item.pick;
    item.pick = pick;
    item.alternatives = [
      { label: "Original pick", pick: old },
      ...item.alternatives.filter((a) => a.pick.product.id !== pick.product.id && a.pick.product.id !== old.product.id),
    ].slice(0, 3);
  }
  return total() <= cap;
}

export function recommend(answers: Answers): KitResult {
  const trade = tradeById(answers.trade);
  const reqs = collectRequirements(answers);
  const needed = new Set<Category>(CORE);
  for (const r of reqs) if (r.hard) needed.add(r.category);
  const warnings: string[] = [];

  const items: CategoryResult[] = [];
  for (const category of CATEGORY_ORDER) {
    if (!needed.has(category)) continue;
    const catReqs = reqs.filter((r) => r.category === category);
    const res = resolveCategory(category, catReqs, answers);
    if (!res) continue;
    items.push(res);
    // Gloves are cheap and task-specific: when no single pair covers everything, add a second pair.
    if (category === "gloves" && res.pick.missing.length) {
      const first = res.pick.product;
      const rest = catReqs.filter((r) => !r.hard || !meets(first, r));
      const second = resolveCategory(category, rest, answers);
      if (second && second.pick.product.id !== first.id && second.pick.missing.length === 0) {
        second.label = "Second pair of gloves";
        res.label = "Gloves (main pair)";
        res.pick.missing = [];
        items.push(second);
      }
    }
  }

  // Hi-vis jackets cover the outerwear need when they also meet the jacket requirements.
  const hivis = items.find((i) => i.category === "hivis");
  const outer = items.find((i) => i.category === "outerwear");
  if (hivis && outer) {
    const outerHard = outer.requirements.filter((r) => r.hard && r.feature);
    const covers = outerHard.length > 0 && outerHard.every((r) => hivis.pick.product.features.includes(r.feature!));
    if (covers) items.splice(items.indexOf(outer), 1);
  }

  for (const item of items) {
    if (item.pick.missing.length) {
      warnings.push(
        `${item.label}: no product in our catalog meets every requirement (${item.pick.missing.join(", ")}). ` +
          `We picked the closest match; check with your safety lead.`,
      );
    }
  }
  if (answers.gender === "women" && items.some((i) => i.pick.product.gender === "men")) {
    warnings.push("Some picks are men's sizing because no women's model meets the requirements. Women usually go down 1.5 sizes in men's boots.");
  }

  if (answers.maxBudget && answers.maxBudget > 0) {
    const fits = applyBudgetCap(items, answers.maxBudget);
    if (!fits) {
      warnings.push(
        `Even the cheapest compliant kit is above your $${answers.maxBudget} budget. We kept the safety requirements and went as low as we could.`,
      );
    }
  }

  const upfront = items.reduce((s, i) => s + i.pick.product.price, 0);
  const perMonth = items.reduce((s, i) => s + i.pick.costPerMonth, 0);
  const cheapestUpfront = items.reduce((s, i) => s + i.cheapest.product.price, 0);
  const cheapestPerMonth = items.reduce((s, i) => s + i.cheapest.costPerMonth, 0);
  const standards = [...new Set(items.flatMap((i) => i.pick.product.standards))].filter((s) => /ASTM|ANSI|NFPA|NRR/.test(s));

  return {
    answers,
    tradeLabel: trade?.label ?? "Worker",
    items,
    totals: {
      upfront: round2(upfront),
      perMonth: round2(perMonth),
      perYear: round2(perMonth * 12),
      cheapestUpfront: round2(cheapestUpfront),
      cheapestPerYear: round2(cheapestPerMonth * 12),
    },
    standards,
    warnings,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
