import { EMPLOYER_RULES, HAZARDS } from "../data/hazards";
import { TRADES } from "../data/trades";
import { z } from "zod";
import type { Answers, EmployerRule } from "./types";

const optionalSize = z.string().trim().max(12).regex(/^[a-zA-Z0-9 .\/-]*$/)
  .transform((value) => value || undefined).optional();
const numericInput = z.union([
  z.number(), z.string().trim().regex(/^\d+(\.\d+)?$/).transform(Number),
]);
const hazardIds = new Set(HAZARDS.map((hazard) => hazard.id));
const ruleIds = new Set(EMPLOYER_RULES.map((rule) => rule.id));

/** Defaults support existing share links; explicitly invalid values are rejected, never dropped. */
export const answersSchema = z.object({
  trade: z.string().refine((id) => TRADES.some((trade) => trade.id === id), "Unknown or missing trade"),
  extraHazards: z.array(z.string().refine((id) => hazardIds.has(id), "Unknown hazard"))
    .max(HAZARDS.length).default([]).transform((ids) => [...new Set(ids)]),
  climate: z.enum(["hot", "mild", "cold", "wet"]).default("mild"),
  gender: z.enum(["men", "women", "unisex"]).default("unisex"),
  shoeSize: optionalSize,
  clothingSize: optionalSize,
  hoursPerWeek: numericInput.pipe(z.number().finite().min(5).max(84)).default(40),
  budget: z.enum(["value", "balanced", "premium"]).default("balanced"),
  maxBudget: z.preprocess((value) => value === "" ? undefined : value,
    numericInput.pipe(z.number().finite().positive().max(10000)).optional()),
  employer: z.array(z.string().refine((id) => ruleIds.has(id as EmployerRule), "Unknown employer rule"))
    .max(EMPLOYER_RULES.length).default([]).transform((ids) => [...new Set(ids)] as EmployerRule[]),
});

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
  const result = answersSchema.safeParse(input);
  return result.success ? result.data : null;
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
