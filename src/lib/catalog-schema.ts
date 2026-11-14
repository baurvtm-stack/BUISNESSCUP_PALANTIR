import { z } from "zod";
import type { Product } from "./types";

export const categorySchema = z.enum([
  "boots", "gloves", "eyewear", "hearing", "head", "hivis", "outerwear", "shirt", "pants",
]);
export const productIdSchema = z.string().min(1).max(96).regex(/^[a-z0-9][a-z0-9-]*$/);
const climateSchema = z.enum(["hot", "mild", "cold", "wet"]);
const httpsUrl = z.string().url().max(2048).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Expected an HTTPS URL without credentials");

/** The JSON seed and Postgres rows share one validated, versionable contract. */
export const catalogRowSchema = z.object({
  id: productIdSchema,
  brand: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(240),
  category: categorySchema,
  gender: z.enum(["men", "women", "unisex"]),
  price_usd: z.number().positive().max(10000),
  price_approximate: z.literal(true),
  last_checked: z.string().date(),
  lifespan_months: z.object({
    light: z.number().positive().max(240),
    moderate: z.number().positive().max(240),
    heavy: z.number().positive().max(240),
  }).refine((life) => life.light >= life.moderate && life.moderate >= life.heavy,
    "Lifespan must decrease as usage intensity increases"),
  sizes: z.array(z.string().min(1).max(24)).min(1).max(250),
  climate: z.array(climateSchema).max(4),
  retailer_url: httpsUrl,
  source_url: httpsUrl,
  quality: z.number().min(1).max(10),
  features: z.array(z.enum([
    "safety_toe", "composite_toe", "eh", "puncture", "slip", "waterproof", "insulated",
    "impact", "welding", "chemical", "touchscreen", "z87plus", "anti_fog", "tinted",
    "electronic", "bluetooth", "class_e", "type_2", "fr", "hivis", "knee_pads", "lightweight", "stretch",
  ])).max(30),
  standards: z.array(z.string().min(1).max(160)).max(20),
  cut_level: z.number().int().min(1).max(9).nullish(),
  nrr: z.number().min(1).max(40).nullish(),
  hivis_class: z.union([z.literal(2), z.literal(3)]).nullish(),
  pack: z.string().max(120).nullish(),
  note: z.string().max(2000).nullish(),
});

export const catalogSchema = z.array(catalogRowSchema).min(1).max(10000).superRefine((rows, ctx) => {
  const ids = new Set<string>();
  rows.forEach((row, index) => {
    if (ids.has(row.id)) ctx.addIssue({ code: "custom", path: [index, "id"], message: "Duplicate product id" });
    ids.add(row.id);
  });
});

export type CatalogRow = z.infer<typeof catalogRowSchema>;

/** Preserve every original Product field; expose the richer catalog fields additively. */
export function toProduct(row: CatalogRow): Product {
  return {
    ...row,
    name: row.model,
    price: row.price_usd,
    lifespanMonths: row.lifespan_months.moderate,
    goodFor: row.climate,
    cutLevel: row.cut_level ?? undefined,
    nrr: row.nrr ?? undefined,
    hivisClass: row.hivis_class ?? undefined,
    pack: row.pack ?? undefined,
    note: row.note ?? undefined,
  };
}
