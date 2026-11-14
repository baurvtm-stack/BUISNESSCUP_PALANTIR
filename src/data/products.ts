import catalog from "./catalog.json";
import { catalogSchema, toProduct } from "../lib/catalog-schema";
import type { Product } from "../lib/types";

/** Bundled, validated snapshot for offline builds and existing synchronous page imports. */
export const PRODUCTS: Product[] = catalogSchema.parse(catalog).map(toProduct);

/** Existing links now use the server-side tracking/affiliate redirect without exposing env vars. */
export function buyUrl(product: Product): string {
  return `/api/click?productId=${encodeURIComponent(product.id)}`;
}
