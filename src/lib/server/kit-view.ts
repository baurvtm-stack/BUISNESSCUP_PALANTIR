/**
 * Server-side entry point the pages use to get kits and reference data.
 * Pages never import the engine or the catalog directly, so when the catalog moves to a
 * database (or recommend() becomes async) only this file has to change.
 */
import { buyUrl, PRODUCTS } from "../../data/products";
import { EMPLOYER_RULES, HAZARDS } from "../../data/hazards";
import { TRADES } from "../../data/trades";
import { encodeAnswers } from "../answers";
import { CATEGORY_LABELS, describeRequirement, effectiveLifespan, recommend } from "../engine";
import type { Answers, Category, EmployerRule, KitResult, Pick, Product, Requirement } from "../types";

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
}

const withUrl = (pick: Pick): ViewPick => ({ ...pick, url: buyUrl(pick.product) });

export async function buildKit(answers: Answers): Promise<KitView> {
  const kit = recommend(answers);
  return {
    token: encodeAnswers(kit.answers),
    answers: kit.answers,
    tradeLabel: kit.tradeLabel,
    totals: kit.totals,
    standards: kit.standards,
    warnings: kit.warnings,
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
  const product = PRODUCTS.find((p) => p.id === id);
  return product ? { product, url: buyUrl(product) } : null;
}

export interface CatalogItem extends Product {
  url: string;
  costPerMonth: number;
  categoryLabel: string;
}

export async function getCatalog(): Promise<CatalogItem[]> {
  return PRODUCTS.map((p) => ({
    ...p,
    url: buyUrl(p),
    costPerMonth: Math.round((p.price / p.lifespanMonths) * 100) / 100,
    categoryLabel: CATEGORY_LABELS[p.category],
  }));
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

export interface WizardData {
  trades: { id: string; label: string; blurb: string; hazards: string[]; optionalHazards: string[] }[];
  hazards: { id: string; label: string; effects: string[] }[];
  employerRules: { id: EmployerRule; label: string; effects: string[] }[];
}

/** Reference data for the questionnaire, with what each hazard or rule adds to the kit. */
export async function getWizardData(): Promise<WizardData> {
  return {
    trades: TRADES.map(({ id, label, blurb, hazards, optionalHazards }) => ({ id, label, blurb, hazards, optionalHazards })),
    hazards: HAZARDS.map((h) => ({ id: h.id, label: h.label, effects: effects(h.requirements.filter((r) => r.hard)) })),
    employerRules: EMPLOYER_RULES.map((r) => ({ id: r.id, label: r.label, effects: effects(r.requirements) })),
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
