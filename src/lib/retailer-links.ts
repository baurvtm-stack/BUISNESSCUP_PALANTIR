import type { CatalogRow } from "./catalog-schema";

/**
 * "Check price" opens the maker's own product page. A model-specific Amazon search is
 * only a fallback for products whose maker page could not be verified, and it is the
 * only kind of link that carries an affiliate tag.
 */
const AMAZON_HOSTS = new Set(["amazon.com", "www.amazon.com"]);

export function isAmazonUrl(value: string | URL): boolean {
  return AMAZON_HOSTS.has(new URL(value).hostname);
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * SQL that sets every product's retailer_url to the bundled snapshot's value, for the
 * Supabase SQL Editor. Rows that already match are skipped, so running it twice is safe.
 */
export function retailerLinksSql(rows: readonly Pick<CatalogRow, "id" | "retailer_url">[]): string {
  return [
    "-- GearFit: send \"Check price\" to manufacturer product pages.",
    "-- Generated from src/data/catalog.json by `npm run catalog:links-sql`. Do not edit by hand.",
    "-- Safe to run more than once: rows that already have the link are left alone.",
    "update public.products as p",
    "set retailer_url = v.retailer_url",
    "from (values",
    rows.map((row) => `  (${quote(row.id)}, ${quote(row.retailer_url)})`).join(",\n"),
    ") as v(id, retailer_url)",
    "where p.id = v.id",
    "  and p.retailer_url is distinct from v.retailer_url;",
    "",
    "-- Result: how many products still use the Amazon search fallback.",
    "select count(*) filter (where retailer_url like 'https://www.amazon.com/%')::int as amazon_fallback_links,",
    "  count(*)::int as products",
    "from public.products;",
    "",
  ].join("\n");
}
