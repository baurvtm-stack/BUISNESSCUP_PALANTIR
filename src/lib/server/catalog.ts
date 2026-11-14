import "server-only";
import { PRODUCTS } from "../../data/products";
import { catalogRowSchema, catalogSchema, categorySchema, productIdSchema, toProduct } from "../catalog-schema";
import type { Category, Product } from "../types";
import { DataUnavailableError, getSupabaseConfiguration, supabaseRequest } from "./supabase";

/** No database credentials are evaluated until a request (or seed) actually runs. */
export async function getProducts(category?: Category): Promise<Product[]> {
  if (category !== undefined) categorySchema.parse(category);
  const config = getSupabaseConfiguration();
  if (!config) return PRODUCTS.filter((product) => !category || product.category === category);
  const rows: unknown[] = [];
  const pageSize = 500;
  for (let offset = 0; offset < 10000;) {
    const query = new URLSearchParams({ select: "*", order: "id.asc", limit: String(pageSize), offset: String(offset) });
    if (category) query.set("category", `eq.${category}`);
    const response = await supabaseRequest(config, `products?${query}`, { headers: { Prefer: "count=exact" } });
    const page: unknown = await response.json();
    if (!Array.isArray(page)) throw new DataUnavailableError();
    rows.push(...page);
    offset += page.length;
    // Respect a project-specific PostgREST row cap, even if it is smaller than our page size.
    const totalText = response.headers.get("content-range")?.split("/")[1];
    const total = totalText && /^\d+$/.test(totalText) ? Number(totalText) : undefined;
    if (page.length === 0 || (total !== undefined && offset >= total)) {
      // An empty category is valid; an entirely empty configured database needs seeding.
      if (!rows.length && category) return [];
      const parsed = catalogSchema.safeParse(rows);
      if (!parsed.success) throw new DataUnavailableError();
      return parsed.data.map(toProduct);
    }
  }
  throw new DataUnavailableError();
}

export async function getProduct(id: string): Promise<Product | null> {
  productIdSchema.parse(id);
  const config = getSupabaseConfiguration();
  if (!config) return PRODUCTS.find((product) => product.id === id) ?? null;
  const query = new URLSearchParams({ select: "*", id: `eq.${id}`, limit: "1" });
  const response = await supabaseRequest(config, `products?${query}`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new DataUnavailableError();
  if (!rows.length) return null;
  const parsed = catalogRowSchema.safeParse(rows[0]);
  if (!parsed.success) throw new DataUnavailableError();
  return toProduct(parsed.data);
}
