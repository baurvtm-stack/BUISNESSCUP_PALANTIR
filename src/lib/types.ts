export type Category =
  | "boots"
  | "gloves"
  | "eyewear"
  | "hearing"
  | "head"
  | "hivis"
  | "outerwear"
  | "shirt"
  | "pants";

export type Feature =
  // boots
  | "safety_toe"
  | "composite_toe"
  | "eh"
  | "puncture"
  | "slip"
  | "waterproof"
  | "insulated"
  // gloves
  | "impact"
  | "welding"
  | "chemical"
  | "touchscreen"
  // eyewear
  | "z87plus"
  | "anti_fog"
  | "tinted"
  // hearing
  | "electronic"
  | "bluetooth"
  // head
  | "class_e"
  | "type_2"
  // clothing
  | "fr"
  | "hivis"
  | "knee_pads"
  | "lightweight"
  | "stretch";

export type Gender = "men" | "women" | "unisex";
export type Climate = "hot" | "mild" | "cold" | "wet";
export type BudgetTier = "value" | "balanced" | "premium";

export interface Product {
  id: string;
  category: Category;
  brand: string;
  name: string;
  gender: Gender;
  /** Approximate street price in USD (as of late 2026). */
  price: number;
  /** Pack description when the price covers more than one unit, e.g. "12 pairs". */
  pack?: string;
  /** Expected service life in months at 40 hours of work per week. */
  lifespanMonths: number;
  /** GearFit quality score, 1-10, based on build, materials and warranty. */
  quality: number;
  features: Feature[];
  /** ANSI/ISEA 105 cut level, 1-9 (A1-A9). */
  cutLevel?: number;
  /** Noise Reduction Rating in dB. */
  nrr?: number;
  /** ANSI/ISEA 107 class. */
  hivisClass?: 2 | 3;
  standards: string[];
  /** Climates where the item is a particularly good fit. */
  goodFor?: Climate[];
  note?: string;
}

export interface Requirement {
  category: Category;
  feature?: Feature;
  minCut?: number;
  minNrr?: number;
  minHivisClass?: 2 | 3;
  /** Hard requirements must be met; soft ones only improve the score. */
  hard: boolean;
  why: string;
}

export interface Hazard {
  id: string;
  label: string;
  requirements: Requirement[];
}

export interface Trade {
  id: string;
  label: string;
  blurb: string;
  hazards: string[];
  /** Extra hazards the user can toggle for this trade. */
  optionalHazards: string[];
}

export type EmployerRule =
  | "safety_toe"
  | "composite_toe"
  | "eh_boots"
  | "hard_hat"
  | "hivis2"
  | "hivis3"
  | "fr"
  | "waterproof_boots";

export interface Answers {
  trade: string;
  extraHazards: string[];
  climate: Climate;
  gender: Gender;
  shoeSize?: string;
  clothingSize?: string;
  hoursPerWeek: number;
  budget: BudgetTier;
  /** Optional hard cap on the whole kit, in USD. */
  maxBudget?: number;
  employer: EmployerRule[];
}

export interface Pick {
  product: Product;
  costPerMonth: number;
  lifespanMonths: number;
  reasons: string[];
  missing: string[];
}

export interface CategoryResult {
  category: Category;
  label: string;
  requirements: Requirement[];
  pick: Pick;
  alternatives: { label: string; pick: Pick }[];
  cheapest: Pick;
  optionsConsidered: number;
}

export interface KitResult {
  answers: Answers;
  tradeLabel: string;
  items: CategoryResult[];
  totals: {
    upfront: number;
    perMonth: number;
    perYear: number;
    cheapestUpfront: number;
    cheapestPerYear: number;
  };
  standards: string[];
  warnings: string[];
}
