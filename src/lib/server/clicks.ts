import "server-only";
import { z } from "zod";
import { productIdSchema } from "../catalog-schema";
import { isAmazonUrl } from "../retailer-links";
import type { Product } from "../types";
import { DataUnavailableError, getSupabaseConfiguration, supabaseRequest } from "./supabase";

export const clickSchema = z.object({
  productId: productIdSchema,
  // May be a UUID or the existing URL-safe answers token; no new kit table required.
  kitId: z.string().min(1).max(2000).regex(/^[a-zA-Z0-9_-]+$/).optional(),
}).strict();
export type ClickInput = z.infer<typeof clickSchema>;

const affiliateSchema = z.object({
  tag: z.string().trim().min(1).max(256),
  parameter: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(40),
});

export function affiliateUrl(product: Product): string {
  if (!product.retailer_url) throw new DataUnavailableError();
  const url = new URL(product.retailer_url);
  if (url.protocol !== "https:" || url.username || url.password) throw new DataUnavailableError();
  const tag = process.env.AFFILIATE_TAG?.trim();
  // The partner tag belongs to Amazon fallback links only; maker pages get their clean URL.
  if (tag && isAmazonUrl(url)) {
    const config = affiliateSchema.safeParse({ tag, parameter: process.env.AFFILIATE_PARAM || "tag" });
    if (!config.success) throw new DataUnavailableError();
    url.searchParams.set(config.data.parameter, config.data.tag);
  }
  return url.toString();
}

/** false explicitly means local mode: no fake in-memory analytics on ephemeral Vercel instances. */
export async function logClick(input: ClickInput): Promise<boolean> {
  const click = clickSchema.parse(input);
  const config = getSupabaseConfiguration();
  if (!config) return false;
  await supabaseRequest(config, "clicks", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ product_id: click.productId, kit_id: click.kitId ?? null }),
  });
  return true;
}
