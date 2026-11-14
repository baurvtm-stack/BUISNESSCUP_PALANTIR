import { z } from "zod";
import { answersSchema } from "@/lib/answers";
import { categorySchema, productIdSchema } from "@/lib/catalog-schema";
import type { KitItemSnapshot } from "@/lib/api/contract";
import { buildKit } from "@/lib/server/kit-view";

export { kitSlugSchema as slugSchema } from "@/lib/retention/validation";
// Strip token, tradeLabel, items and totals: client prices and safety data are
// never trusted. Only validated answers and choices affect the stored kit.
export const saveKitSchema = z.object({
  answers: answersSchema,
  choices: z
    .array(z.union([z.literal(""), productIdSchema]))
    .max(20)
    .optional(),
});

export async function kitSnapshot(input: z.output<typeof saveKitSchema>) {
  const kit = await buildKit(input.answers);
  return {
    answers: kit.answers,
    items: kit.items.map((item, index) => {
      const id = input.choices?.[index];
      const pick =
        [item.pick, ...item.alternatives.map((option) => option.pick)].find(
          (option) => option.product.id === id,
        ) ?? item.pick;
      return { category: item.category, label: item.label, pick };
    }),
  };
}

// The stored chosen pick remains intact for reminders, wear and price alerts.
const storedItemSchema = z.object({
  category: categorySchema,
  label: z.string(),
  pick: z.object({
    product: z.object({
      id: productIdSchema,
      brand: z.string(),
      name: z.string(),
      price: z.number().finite().nonnegative(),
    }),
    lifespanMonths: z.number().finite().positive(),
    costPerMonth: z.number().finite().nonnegative(),
  }),
});

export function kitItemSnapshots(items: unknown): KitItemSnapshot[] {
  return z
    .array(storedItemSchema)
    .max(20)
    .parse(items)
    .map(({ category, label, pick }) => ({
      category,
      label,
      productId: pick.product.id,
      brand: pick.product.brand,
      name: pick.product.name,
      price: pick.product.price,
      lifespanMonths: pick.lifespanMonths,
      costPerMonth: pick.costPerMonth,
    }));
}
