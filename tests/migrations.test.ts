import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import seed from "../src/data/catalog.json";
import { catalogSchema } from "../src/lib/catalog-schema";

describe("Postgres migrations and seed contract", () => {
  const db = new PGlite();
  const rows = catalogSchema.parse(seed);
  beforeAll(async () => {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;");
    const folder = resolve("supabase/migrations");
    for (const file of readdirSync(folder).filter((file) => file.endsWith(".sql")).sort()) {
      await db.exec(readFileSync(resolve(folder, file), "utf8"));
    }
  });
  afterAll(async () => { await db.close(); });

  const upsert = `insert into public.products (
    id, brand, model, category, gender, price_usd, price_approximate, last_checked,
    lifespan_months, sizes, climate, retailer_url, source_url, quality, features,
    standards, cut_level, nrr, hivis_class, pack, note
  ) select id, brand, model, category, gender, price_usd, price_approximate, last_checked,
    lifespan_months, sizes, climate, retailer_url, source_url, quality, features,
    standards, cut_level, nrr, hivis_class, pack, note
    from jsonb_populate_recordset(null::public.products, $1::jsonb)
    on conflict (id) do update set price_usd = excluded.price_usd`;

  it("accepts the complete catalog and repeated upserts without duplicating products", async () => {
    await db.query(upsert, [JSON.stringify(rows)]);
    await db.query(upsert, [JSON.stringify(rows)]);
    const result = await db.query<{ count: number }>("select count(*)::integer as count from public.products");
    expect(result.rows[0].count).toBe(rows.length);
  });

  it("persists click references and timestamps using only server-assigned IDs", async () => {
    await db.exec("set role service_role");
    try {
      const result = await db.query<{ id: string; product_id: string; created_at: Date }>(
        "insert into public.clicks(product_id,kit_id) values ($1,$2) returning *", [rows[0].id, "kit_123"],
      );
      expect(result.rows[0].product_id).toBe(rows[0].id);
      expect(result.rows[0].id).toMatch(/^[a-f0-9-]{36}$/);
      expect(result.rows[0].created_at).toBeTruthy();
      await expect(db.query("insert into public.clicks(product_id) values ('unknown-product')")).rejects.toThrow();
    } finally { await db.exec("reset role"); }
  });

  it.each(["anon", "authenticated"])("blocks catalog and analytics access for %s", async (role) => {
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query("select * from public.products")).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from public.clicks")).rejects.toThrow(/permission denied/);
      await expect(db.query("insert into public.clicks(product_id) values ($1)", [rows[0].id])).rejects.toThrow(/permission denied/);
    } finally { await db.exec("reset role"); }
  });

  it("enables RLS and rejects invalid prices, lifespans, and categories", async () => {
    const result = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname in ('products','clicks')");
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((row) => row.relrowsecurity)).toBe(true);
    for (const overrides of [
      { price_usd: -1 }, { category: "anything" },
      { lifespan_months: { light: 1, moderate: 2, heavy: 3 } },
      { lifespan_months: {} }, { features: ["invented"] },
    ]) {
      await expect(db.query(upsert, [JSON.stringify([{ ...rows[0], id: "invalid-row", ...overrides }])])).rejects.toThrow();
    }
  });
});
