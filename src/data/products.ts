import catalog from "./catalog.json";
import { catalogSchema, toProduct } from "../lib/catalog-schema";
import type { Product } from "../lib/types";

/** Bundled, validated snapshot for offline builds and existing synchronous page imports. */
export const PRODUCTS: Product[] = catalogSchema.parse(catalog).map(toProduct);

/** Retailer destinations remain available to the existing synchronous views. */
export function buyUrl(product: Product): string {
  return product.retailer_url!;
}
