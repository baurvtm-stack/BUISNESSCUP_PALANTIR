import { z } from "zod";
import { TRADES } from "../../data/trades";
import { HAZARDS, EMPLOYER_RULES } from "../../data/hazards";
import { recommend } from "../engine";
import { ApiError } from "./core";

export const slugSchema = z.string().regex(/^[A-Za-z0-9_-]{12}$/);
const knownId = <T extends string>(ids: T[]) => z.string().max(80).refine(id => ids.includes(id as T)).transform(id => id as T);
export const answersSchema = z.object({
  trade: knownId(TRADES.map(t => t.id)),
  extraHazards: z.array(knownId(HAZARDS.map(h => h.id))).max(30).default([]),
  climate: z.enum(["hot", "mild", "cold", "wet"]).default("mild"),
  gender: z.enum(["men", "women", "unisex"]).default("unisex"),
  hoursPerWeek: z.number().min(5).max(84).default(40),
  budget: z.enum(["value", "balanced", "premium"]).default("balanced"),
  maxBudget: z.number().positive().max(10000).optional(),
  shoeSize: z.string().max(12).optional(), clothingSize: z.string().max(12).optional(),
  employer: z.array(knownId(EMPLOYER_RULES.map(r => r.id))).max(20).default([]),
}).strict();
export const saveKitSchema = z.object({
  answers: answersSchema,
  // Accept the existing UI's chosen picks but trust only their product IDs.
  items: z.array(z.object({ pick: z.object({ product: z.object({ id: z.string().max(80) }).passthrough() }).passthrough() }).passthrough()).min(1).max(20).optional(),
}).strict();
export function kitSnapshot(input: z.output<typeof saveKitSchema>) {
  const kit = recommend(input.answers);
  if (input.items) {
    if (input.items.length !== kit.items.length) throw new ApiError(400, "Include one selection for each kit item, in kit order");
    kit.items = kit.items.map((item, index) => {
      const id = input.items![index].pick.product.id;
      const pick = [item.pick, item.cheapest, ...item.alternatives.map(a => a.pick)].find(p => p.product.id === id);
      if (!pick) throw new ApiError(400, "Selected product is not an option for this kit item");
      return { ...item, pick };
    });
  }
  return { answers: kit.answers, items: kit.items };
}
