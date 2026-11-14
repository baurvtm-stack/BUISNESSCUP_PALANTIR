import { EMPLOYER_RULES, HAZARDS } from "../data/hazards";
import { TRADES } from "../data/trades";
import type { Answers, BudgetTier, Climate, EmployerRule, Gender } from "./types";

const CLIMATES: Climate[] = ["hot", "mild", "cold", "wet"];
const GENDERS: Gender[] = ["men", "women", "unisex"];
const BUDGETS: BudgetTier[] = ["value", "balanced", "premium"];

export const DEFAULT_ANSWERS: Answers = {
  trade: "electrician",
  extraHazards: [],
  climate: "mild",
  gender: "men",
  hoursPerWeek: 40,
  budget: "balanced",
  employer: [],
};

/** Validates untrusted input (URL or API body) into a safe Answers object. */
export function parseAnswers(input: unknown): Answers | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.trade !== "string" || !TRADES.some((t) => t.id === o.trade)) return null;
  const hazardIds = new Set(HAZARDS.map((h) => h.id));
  const ruleIds = new Set(EMPLOYER_RULES.map((r) => r.id));
  const str = (v: unknown, max = 12) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const hours = Number(o.hoursPerWeek);
  const maxBudget = Number(o.maxBudget);
  return {
    trade: o.trade,
    extraHazards: Array.isArray(o.extraHazards)
      ? [...new Set(o.extraHazards.filter((h): h is string => typeof h === "string" && hazardIds.has(h)))]
      : [],
    climate: CLIMATES.includes(o.climate as Climate) ? (o.climate as Climate) : "mild",
    gender: GENDERS.includes(o.gender as Gender) ? (o.gender as Gender) : "unisex",
    shoeSize: str(o.shoeSize, 6),
    clothingSize: str(o.clothingSize, 6),
    hoursPerWeek: Number.isFinite(hours) ? Math.min(84, Math.max(5, Math.round(hours))) : 40,
    budget: BUDGETS.includes(o.budget as BudgetTier) ? (o.budget as BudgetTier) : "balanced",
    maxBudget: Number.isFinite(maxBudget) && maxBudget > 0 ? Math.min(10000, Math.round(maxBudget)) : undefined,
    employer: Array.isArray(o.employer)
      ? [...new Set(o.employer.filter((r): r is EmployerRule => typeof r === "string" && ruleIds.has(r as EmployerRule)))]
      : [],
  };
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Encodes answers into a compact URL-safe token, so a kit can be shared without accounts. */
export function encodeAnswers(a: Answers): string {
  return toBase64Url(JSON.stringify(a));
}

export function decodeAnswers(token: string | undefined | null): Answers | null {
  if (!token || token.length > 2000) return null;
  try {
    return parseAnswers(JSON.parse(fromBase64Url(token)));
  } catch {
    return null;
  }
}
