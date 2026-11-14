import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import seed from "../src/data/catalog.json";
import { catalogSchema, type CatalogRow } from "../src/lib/catalog-schema";
import { retailerLinksSql } from "../src/lib/retailer-links";

const rows = catalogSchema.parse(seed);
const script = readFileSync(resolve("supabase/manufacturer-links.sql"), "utf8");
// A database seeded before this change sent Check price to an Amazon search for every product.
const amazonSearch = (row: Pick<CatalogRow, "brand" | "model">) =>
  `https://www.amazon.com/s?k=${encodeURIComponent(`${row.brand} ${row.model}`)}`;
const databaseOnly = {
  ...rows[0], id: "database-only-boot", model: "Database-only boot",
  retailer_url: amazonSearch({ brand: rows[0].brand, model: "Database-only boot" }),
};

describe("manufacturer link update for an already seeded Supabase catalog", () => {
  const db = new PGlite();
  beforeAll(async () => {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;");
    const folder = resolve("supabase/migrations");
    for (const file of readdirSync(folder).filter((file) => file.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(resolve(folder, file), "utf8"));
    }
    const seeded = [...rows.map((row) => ({ ...row, retailer_url: amazonSearch(row) })), databaseOnly];
    await db.query(`insert into public.products (
      id, brand, model, category, gender, price_usd, price_approximate, last_checked,
      lifespan_months, sizes, climate, retailer_url, source_url, quality, features,
      standards, cut_level, nrr, hivis_class, pack, note
    ) select id, brand, model, category, gender, price_usd, price_approximate, last_checked,
      lifespan_months, sizes, climate, retailer_url, source_url, quality, features,
      standards, cut_level, nrr, hivis_class, pack, note
      from jsonb_populate_recordset(null::public.products, $1::jsonb)`, [JSON.stringify(seeded)]);
  }, 30000);
  afterAll(async () => { await db.close(); });

  it("is generated from the bundled snapshot", () => {
    expect(script).toBe(retailerLinksSql(rows));
  });

  it("copies every snapshot link, leaves other products alone and changes nothing on a second run", async () => {
    const [update, summary] = await db.exec(script);
    expect(update.affectedRows).toBe(rows.filter((row) => row.retailer_url !== amazonSearch(row)).length);
    expect(summary.rows).toEqual([{ amazon_fallback_links: 2, products: rows.length + 1 }]);

    const stored = await db.query<{ id: string; retailer_url: string }>("select id, retailer_url from public.products");
    expect(Object.fromEntries(stored.rows.map((row) => [row.id, row.retailer_url]))).toEqual({
      ...Object.fromEntries(rows.map((row) => [row.id, row.retailer_url])),
      [databaseOnly.id]: databaseOnly.retailer_url,
    });

    const [again] = await db.exec(script);
    expect(again.affectedRows).toBe(0);
  });
});
