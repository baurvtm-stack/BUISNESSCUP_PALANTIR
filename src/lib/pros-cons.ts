/**
 * Plain-language pros and cons for the options shown for one kit item.
 *
 * Every line is computed from catalog fields and the shopper's answers: price, estimated
 * wear life, cost per month, GearFit quality score, rated levels against the requirement,
 * features and sizing. Nothing here is a marketing claim, and a metric where every option
 * ties produces no line at all.
 *
 * Rankings ("lowest price", "longest wear life") are among the options shown for the item,
 * never the whole market, so the page must show these lines next to that set of options.
 */
import { CLIMATE_REQUIREMENTS } from "../data/hazards";
import { describeRequirement, meets } from "./engine";
import { duration, usd } from "./format";
import type { Climate, Feature, Gender, Pick, Product, Requirement } from "./types";

export interface ProsCons {
  pros: string[];
  cons: string[];
}

export interface ProsConsContext {
  /** Hard and soft requirements for this item. */
  requirements: Requirement[];
  climate: Climate;
  gender: Gender;
  /** How many catalog products met every hard requirement. */
  optionsConsidered: number;
  /** The engine's own top-scored product, when it is one of the options. */
  topScoredId?: string;
}

const MAX_PROS = 3;
const MAX_CONS = 3;

const WEATHER: Record<Climate, string> = { hot: "hot weather", mild: "mild weather", cold: "cold weather", wet: "rainy weather" };

/** Features that read as adjectives ("Not waterproof"); the rest read as nouns ("No tinted lens"). */
const ADJECTIVES: Feature[] = ["waterproof", "insulated", "lightweight", "fr", "chemical", "welding", "hivis", "electronic"];

/** Specialty protection is only worth mentioning when the job asks for it. */
const SPECIALTY: Feature[] = ["welding", "chemical", "fr"];

const featureName = (category: Product["category"], feature: Feature) => describeRequirement({ category, feature, hard: false, why: "" });
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Wear life as the kit page shows it: whole months once it is long enough to round. */
const shownLife = (pick: Pick) => (pick.lifespanMonths >= 2 ? Math.round(pick.lifespanMonths) : pick.lifespanMonths);

interface Rank {
  best: boolean;
  worst: boolean;
  /** True when several options share the first or last place. */
  tie: boolean;
  /** Distance from the opposite end of the range. */
  gap: number;
}

/** Where each value stands. Returns null when every option ties, so no line is written. */
function rank(values: number[], better: "low" | "high"): (Rank | null)[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return values.map(() => null);
  const [bestValue, worstValue] = better === "low" ? [min, max] : [max, min];
  return values.map((v) => {
    const best = v === bestValue;
    const worst = v === worstValue;
    const shared = values.filter((x) => x === v).length > 1;
    return {
      best,
      worst,
      tie: (best || worst) && shared,
      gap: Math.abs(v - (best ? worstValue : bestValue)),
    };
  });
}

/** "Lowest price" or "Ties for lowest price". */
const lead = (r: Rank, text: string) => (r.tie ? `Ties for ${text}` : capitalize(text));

function softContext(req: Requirement, climate: Climate): string {
  const fromClimate = CLIMATE_REQUIREMENTS[climate].some((c) => c.category === req.category && c.feature === req.feature && !c.hard);
  return fromClimate ? `recommended for ${WEATHER[climate]}` : "recommended for your job";
}

function lacks(req: Requirement): string {
  const what = describeRequirement(req);
  return req.feature && ADJECTIVES.includes(req.feature) ? `Not ${what}` : `No ${what}`;
}

/** A rated level above the minimum the job needs, or the highest rating among the options. */
function ratingLine(
  product: Product,
  requirements: Requirement[],
  highest: { cut: boolean; nrr: boolean },
): string | null {
  const minCut = Math.max(0, ...requirements.map((r) => r.minCut ?? 0));
  const minNrr = Math.max(0, ...requirements.map((r) => r.minNrr ?? 0));
  const minClass = Math.max(0, ...requirements.map((r) => r.minHivisClass ?? 0));
  if (product.cutLevel) {
    if (highest.cut) return `Highest cut rating: A${product.cutLevel}`;
    if (minCut && product.cutLevel > minCut) return `Cut level A${product.cutLevel}, above the A${minCut} your job needs`;
  }
  if (product.nrr) {
    if (highest.nrr) return `Highest noise reduction: NRR ${product.nrr} dB`;
    if (minNrr && product.nrr > minNrr) return `NRR ${product.nrr} dB, above the ${minNrr} dB your job needs`;
  }
  if (minClass && (product.hivisClass ?? 0) > minClass) {
    return `Class ${product.hivisClass} hi-vis, above the Class ${minClass} your job needs`;
  }
  return null;
}

/** A feature that says nothing new: hi-vis on a hi-vis garment, "safety toe" next to "composite toe". */
function isImplied(product: Product, feature: Feature): boolean {
  if (feature === "hivis") return product.category === "hivis";
  if (feature === "safety_toe") return product.features.includes("composite_toe");
  return false;
}

/** Pros and cons for each option, in the same order as `options`. */
export function prosAndCons(options: Pick[], ctx: ProsConsContext): ProsCons[] {
  const n = options.length;
  const soft = ctx.requirements.filter((r) => !r.hard);
  const required = new Set(ctx.requirements.map((r) => r.feature).filter(Boolean));

  const monthly = rank(options.map((o) => o.costPerMonth), "low");
  const price = rank(options.map((o) => o.product.price), "low");
  const life = rank(options.map(shownLife), "high");
  const quality = rank(options.map((o) => o.product.quality), "high");
  const cut = rank(options.map((o) => o.product.cutLevel ?? 0), "high");
  const nrr = rank(options.map((o) => o.product.nrr ?? 0), "high");
  // A feature every option has tells the shopper nothing about this one.
  const shared = new Set(n > 1 ? options[0].product.features.filter((f) => options.every((o) => o.product.features.includes(f))) : []);
  const womensChoice = ctx.gender === "women" && new Set(options.map((o) => o.product.gender)).size > 1;

  return options.map((option, i) => {
    const p = option.product;
    const pros: string[] = [];
    const cons: string[] = [];

    if (ctx.optionsConsidered === 1) pros.push("The only product in our catalog that meets every requirement for this item");

    for (const req of soft) {
      if (meets(p, req)) pros.push(`${capitalize(describeRequirement(req))}: ${softContext(req, ctx.climate)}`);
      else cons.push(`${lacks(req)}: ${softContext(req, ctx.climate)}`);
    }

    const m = monthly[i];
    if (m?.best) pros.push(`${lead(m, "lowest cost per month")}: ${usd(option.costPerMonth, 2)}`);
    else if (m?.worst) cons.push(`${lead(m, "highest cost per month")}: ${usd(m.gap, 2)} above the lowest`);

    const pr = price[i];
    // A multi-pack costs more at the till for a reason, so the price line says what it buys.
    const pack = p.pack ? ` (price is for ${p.pack})` : "";
    if (pr?.best) pros.push(`${lead(pr, "lowest price")}: ${usd(pr.gap)} below the priciest${pack}`);
    else if (pr?.worst) cons.push(`${lead(pr, "highest price")}: ${usd(pr.gap)} above the cheapest${pack}`);

    const l = life[i];
    const lifeText = `about ${duration(shownLife(option))}`;
    if (l?.best) pros.push(`${lead(l, "longest estimated wear life")}: ${lifeText}`);
    else if (l?.worst) cons.push(`${lead(l, "shortest estimated wear life")}: ${lifeText}`);

    const rating = ratingLine(p, ctx.requirements, { cut: !!cut[i]?.best && !cut[i]?.tie, nrr: !!nrr[i]?.best && !nrr[i]?.tie });
    if (rating) pros.push(rating);

    const q = quality[i];
    if (q?.best) pros.push(`${lead(q, "highest GearFit quality score")}: ${p.quality}/10`);
    else if (q?.worst) cons.push(`${lead(q, "lowest GearFit quality score")}: ${p.quality}/10`);

    if (womensChoice) {
      if (p.gender === "women") pros.push("Made in women's sizing");
      else if (p.gender === "unisex") cons.push("Unisex sizing, not a women's fit");
    }

    const extras = p.features
      .filter((f) => !required.has(f) && !SPECIALTY.includes(f) && !isImplied(p, f) && !shared.has(f))
      .map((f) => featureName(p.category, f));
    if (extras.length) pros.push(`Also: ${extras.slice(0, 3).join(", ")}`);

    if (p.goodFor?.includes(ctx.climate)) pros.push(`Marked a good fit for ${WEATHER[ctx.climate]} in our catalog`);

    if (!pros.length && p.id === ctx.topScoredId && n > 1) {
      pros.push("Best overall score on price, cost per month and quality for your priority");
    }
    if (!pros.length && ctx.requirements.some((r) => r.hard) && !option.missing.length) {
      pros.push("Meets every requirement for this item");
    }

    return { pros: pros.slice(0, MAX_PROS), cons: cons.slice(0, MAX_CONS) };
  });
}
