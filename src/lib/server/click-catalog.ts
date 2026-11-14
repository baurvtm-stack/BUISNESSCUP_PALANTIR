import "server-only";
import { unstable_cache } from "next/cache";
import { PRODUCTS } from "@/data/products";
import { productIdSchema } from "@/lib/catalog-schema";
import type { Product } from "@/lib/types";
import { getProducts } from "@/lib/server/catalog";

// Outbound links may use a recent catalog even when storage is unavailable.
// Keep this policy separate from recommendation/catalog APIs, which report DB failures.
export const cachedCatalog = unstable_cache(
  () => getProducts(),
  ["click-catalog-v1", process.env.SUPABASE_URL?.trim() || "bundled"],
  { revalidate: 60 },
);

export async function getClickProduct(id: string): Promise<Product | null> {
  productIdSchema.parse(id);
  let products: Product[];
  try {
    products = await cachedCatalog();
  } catch {
    products = PRODUCTS;
  }
  return products.find(product => product.id === id) ?? null;
}
