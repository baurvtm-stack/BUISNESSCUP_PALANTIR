import { CLIMATE_REQUIREMENTS, EMPLOYER_RULES, hazardById } from "../data/hazards";
import { PRODUCTS } from "../data/products";
import { tradeById } from "../data/trades";
import { coveredStandards } from "@/lib/standards";
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
  if (req.standard && !hasStandard(product, req.standard)) return false;
  if (req.feature && !product.features.includes(req.feature)) return false;
  if (req.minCut && (product.cutLevel ?? 0) < req.minCut) return false;
  if (req.minNrr && (product.nrr ?? 0) < req.minNrr) return false;
  if (req.minHivisClass && (product.hivisClass ?? 0) < req.minHivisClass) return false;
  // A feature flag alone is not evidence of a protective rating.
  if (req.minCut) {
    if (!hasStandard(product, "ANSI/ISEA 105")) return false;
    const ratings = standardRatings(product, "ANSI/ISEA 105", /\bA([1-9])\b/i);
    if (ratings.length && !ratings.includes(product.cutLevel ?? 0)) return false;
  }
  if (req.minHivisClass) {
    const ratings = standardRatings(product, "ANSI/ISEA 107", /\bClass\s+([123])\b/i);
    if (!ratings.includes(product.hivisClass ?? 0)) return false;
  }
  if (req.minNrr && !product.standards.some((s) => Number(s.match(/\bNRR\s+(\d+)\s*dB\b/i)?.[1]) === product.nrr)) return false;
  if (["safety_toe", "composite_toe", "eh", "puncture"].includes(req.feature ?? "")) {
    if (!hasStandard(product, "ASTM F2413")) return false;
    if (req.feature === "eh" && !qualifiedStandard(product, "ASTM F2413", /\bEH\b/i)) return false;
    if (req.feature === "puncture" && !qualifiedStandard(product, "ASTM F2413", /\bPR\b/i)) return false;
  }
  if (req.feature === "z87plus" && !hasStandard(product, "ANSI Z87.1+")) return false;
  if (req.category === "head" && !hasStandard(product, "ANSI Z89.1")) return false;
  if (req.feature === "class_e" && !qualifiedStandard(product, "ANSI Z89.1", /\bClass\s+E\b/i)) return false;
  if (req.feature === "type_2" && !qualifiedStandard(product, "ANSI Z89.1", /\bType\s+(II|2)\b/i)) return false;
  if (req.feature === "impact" && !hasStandard(product, "ANSI/ISEA 138")) return false;
  if (req.feature === "fr") {
    const arcRated = hasStandard(product, "ASTM F1506");
    if (req.category === "outerwear") {
      if (!arcRated && !hasStandard(product, "ASTM D6413")) return false;
    } else if (!arcRated) return false;
  }
  if (req.feature === "chemical" && !product.standards.some((s) => /\b(?:(?:EN\s+(?:ISO\s+)?)?374|ASTM\s+F739)\b/i.test(s))) return false;
  return true;
}

/** Match a standard family without accepting a different standard with the same prefix. */
function standardMatches(value: string, standard: string): boolean {
  const patterns: Record<string, RegExp> = {
    "ASTM F2413": /\bASTM\s+F-?2413(?=\b)/i,
    "ASTM F1506": /\bASTM\s+F-?1506(?=\b)/i,
    "ASTM D6413": /\bASTM\s+D-?6413(?=\b)/i,
    "ANSI Z87.1+": /\bANSI(?:\/ISEA)?\s+Z87\.1(?:-\d{4})?\s*\+/i,
    "ANSI Z89.1": /\bANSI(?:\/ISEA)?\s+Z89\.1(?=\b)/i,
    "ANSI/ISEA 105": /\b(?:ANSI\/)?ISEA\s+105(?=\b)/i,
    "ANSI/ISEA 107": /\b(?:ANSI\/)?ISEA\s+107(?=\b)/i,
    "ANSI/ISEA 138": /\b(?:ANSI\/)?ISEA\s+138(?=\b)/i,
  };
  return patterns[standard]?.test(value) ?? value.trim().toLowerCase() === standard.trim().toLowerCase();
}

function hasStandard(product: Product, standard: string): boolean {
  return product.standards.some((s) => standardMatches(s, standard));
}

function qualifiedStandard(product: Product, standard: string, qualifier: RegExp): boolean {
  return product.standards.some((s) => standardMatches(s, standard) && qualifier.test(s));
}

function standardRatings(product: Product, standard: string, rating: RegExp): number[] {
  return product.standards.filter((s) => standardMatches(s, standard))
    .map((s) => Number(s.match(rating)?.[1])).filter(Number.isFinite);
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
  if (req.standard) return req.standard;
  return "rated protection";
}

/** Interpolated wear estimate, not a manufacturer replacement or inspection interval. */
export function effectiveLifespan(product: Product, hoursPerWeek: number): number {
  const hours = Number.isFinite(hoursPerWeek) ? Math.min(84, Math.max(5, hoursPerWeek)) : 40;
  const life = product.lifespan_months ?? {
    light: product.lifespanMonths * 2,
    moderate: product.lifespanMonths,
    heavy: product.lifespanMonths * 2 / 3,
  };
  let months: number;
  if (hours <= 20) months = life.light;
  else if (hours <= 40) months = life.light + (life.moderate - life.light) * (hours - 20) / 20;
  else if (hours <= 60) months = life.moderate + (life.heavy - life.moderate) * (hours - 40) / 20;
  else months = life.heavy * 60 / hours;
  const estimate = Math.max(0.1, Math.round(months * 10) / 10);
  // Headgear also ages with calendar time. Do not extend its planning horizon for
  // fewer hours; the 40-hour estimate is a conservative cap, not a safe expiry date.
  return product.category === "head" ? Math.min(life.moderate, estimate) : estimate;
}

function genderOk(product: Product, gender: Answers["gender"]): boolean {
  if (gender === "unisex" || product.gender === "unisex") return true;
  return product.gender === gender;
}

const CLOTHING_CATEGORIES: Category[] = ["shirt", "pants", "outerwear", "hivis"];
const normalizeSize = (size: string) => size.trim().toLowerCase().replace(/\s+/g, "");

function sizeOk(product: Product, answers: Answers): boolean {
  const requested = product.category === "boots" ? answers.shoeSize
    : CLOTHING_CATEGORIES.includes(product.category) ? answers.clothingSize : undefined;
  if (!requested?.trim()) return true;
  // Combined garment sizes such as "S/M" fit either named size.
  const sizes = product.sizes?.flatMap((size) => size.split("/").map(normalizeSize)) ?? [];
  // The existing form accepts both a top size and a waist/inseam, e.g. "L / 34x32".
  const choices = requested.split("/").map(normalizeSize).filter(Boolean);
  return sizes.includes("one-size") || choices.some((size) => sizes.includes(size));
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
    const key = `${r.category}|${r.feature ?? ""}|${r.standard ?? ""}|${r.minCut ? "cut" : ""}|${r.minNrr ? "nrr" : ""}|${r.minHivisClass ? "hv" : ""}`;
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
  const reasons = reqs.filter((r) => meets(product, r)).map((r) => `${capitalize(describeRequirement(r))}: ${r.why}`);
  if (!reasons.length) reasons.push(`Everyday ${CATEGORY_LABELS[product.category].toLowerCase()} selected for price, estimated wear life and quality.`);
  if (product.category === "head") {
    reasons.push("Headgear life is a planning estimate. Inspect before use; impacts, damage and the manufacturer's shell and suspension replacement limits override this estimate.");
  }
  return {
    product,
    lifespanMonths: life,
    costPerMonth: round2(product.price / life),
    reasons,
    why: `${reasons.join(" ")} Estimated ${life} months at ${hoursPerWeek} h/week; approximately $${round2(product.price / life).toFixed(2)}/month.`,
    missing: reqs.filter((r) => r.hard && !meets(product, r)).map((r) => describeRequirement(r)),
  };
}

/** Preserve a previously selected product without relaxing fit or mandatory protection. */
export function withSavedChoice(
  item: CategoryResult,
  productId: string | undefined,
  answers: Answers,
  products: readonly Product[],
): CategoryResult {
  if (!productId || item.pick.product.id === productId ||
    item.alternatives.some((option) => option.pick.product.id === productId)) return item;
  const product = products.find((candidate) => candidate.id === productId);
  if (!product || product.category !== item.category || !genderOk(product, answers.gender) ||
    !sizeOk(product, answers) || !item.requirements.filter((req) => req.hard).every((req) => meets(product, req))) return item;
  return {
    ...item,
    alternatives: [
      { label: "Saved choice", pick: makePick(product, item.requirements, answers.hoursPerWeek) },
      ...item.alternatives,
    ],
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
    .sort((a, b) => b.score - a.score || a.product.price - b.product.price || compareId(a.product, b.product));
}

function compareId(a: Product, b: Product): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function resolveCategory(category: Category, reqs: Requirement[], answers: Answers, products: Product[]): CategoryResult | null {
  const all = products.filter((p) => p.category === category && genderOk(p, answers.gender) && sizeOk(p, answers));
  if (all.length === 0) return null;
  const hard = reqs.filter((r) => r.hard);
  const pool = all.filter((p) => hard.every((r) => meets(p, r)));
  if (pool.length === 0) return null;
  const ranked = scoreAll(pool, reqs, answers);
  const top = ranked[0].product;
  const cheapest = [...pool].sort((a, b) => a.price - b.price || compareId(a, b))[0];
  const bestValue = [...pool].sort(
    (a, b) =>
      a.price / effectiveLifespan(a, answers.hoursPerWeek) - b.price / effectiveLifespan(b, answers.hoursPerWeek) || compareId(a, b),
  )[0];
  const premium = [...pool].sort((a, b) => b.quality - a.quality || b.lifespanMonths - a.lifespanMonths || compareId(a, b))[0];

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
        if (alt.missing.length) continue;
        const saving = item.pick.product.price - alt.product.price;
        if (saving > 0 && (!bestSwap || saving > bestSwap.saving ||
          (saving === bestSwap.saving && compareId(alt.product, bestSwap.pick.product) < 0))) {
          bestSwap = { item, pick: alt, saving };
        }
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

/** A synchronous pure engine; API callers supply the current database catalog. */
export function recommend(answers: Answers, products: Product[] = PRODUCTS): KitResult {
  const trade = tradeById(answers.trade);
  const reqs = collectRequirements(answers);
  const needed = new Set<Category>(CORE);
  for (const r of reqs) if (r.hard) needed.add(r.category);
  const warnings: string[] = [];

  const items: CategoryResult[] = [];
  for (const category of CATEGORY_ORDER) {
    if (!needed.has(category)) continue;
    const catReqs = reqs.filter((r) => r.category === category);
    const res = resolveCategory(category, catReqs, answers, products);
    if (res) {
      items.push(res);
      continue;
    }
    // Split different tasks, never silently waive a requirement or imply that gloves can be layered.
    if (category === "gloves") {
      const groups = [
        { label: "Gloves (handling tasks)", reqs: catReqs.filter((r) => r.feature !== "chemical" && r.feature !== "welding") },
        { label: "Gloves (chemical tasks)", reqs: catReqs.filter((r) => r.feature === "chemical" || !r.hard) },
        { label: "Gloves (welding tasks)", reqs: catReqs.filter((r) => r.feature === "welding" || !r.hard) },
      ].filter((group) => group.reqs.some((r) => r.hard));
      if (groups.length > 1) {
        for (const group of groups) {
          const taskPick = resolveCategory(category, group.reqs, answers, products);
          if (taskPick) items.push({ ...taskPick, label: group.label });
          else warnings.push(unavailableWarning(group.label, group.reqs));
        }
        warnings.push("Gloves are separated by task: change pairs between tasks. Separate pairs do not provide combined protection for simultaneous hazards; have your safety lead specify a suitable glove for those tasks.");
        continue;
      }
    }
    warnings.push(unavailableWarning(CATEGORY_LABELS[category], catReqs));
  }

  if (reqs.some((r) => r.feature === "chemical" && r.hard)) {
    warnings.push("Chemical gloves require a match to the specific chemical, concentration and contact time using the manufacturer's permeation data; a generic chemical-resistance rating is insufficient.");
  }
  if (reqs.some((r) => r.standard === "ASTM F1506" && r.hard)) {
    warnings.push("Arc-rated clothing is only part of arc-flash PPE. Your employer's incident-energy assessment must confirm the required arc rating and additional face, head and hand protection; NFPA 70E is a workplace standard, not a product certification.");
  }
  if (reqs.some((r) => r.feature === "welding" && r.hard)) {
    warnings.push("Welding also requires process-appropriate shaded face/eye protection. Safety glasses in this kit do not replace a welding helmet; select it with your safety lead.");
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
  const standards = coveredStandards(items.map((item) => item.pick.product));

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

function unavailableWarning(label: string, reqs: Requirement[]): string {
  const requirements = reqs.filter((r) => r.hard).map(describeRequirement);
  const detail = requirements.length ? ` (${requirements.join(", ")})` : "";
  return `${label}: no catalog product meets every mandatory requirement${detail} in the requested gender and size. This category is missing from the kit; verify suitable equipment with your safety lead before use.`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
