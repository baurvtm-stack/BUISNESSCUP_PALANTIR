import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import catalog from "../src/data/catalog.json";
import { catalogSchema } from "../src/lib/catalog-schema";
import { getSupabaseConfiguration, supabaseRequest } from "../src/lib/server/supabase";

async function main() {
  const args = z.array(z.literal("--check")).max(1).parse(process.argv.slice(2));
  const rows = catalogSchema.parse(catalog);
  if (args.includes("--check")) {
    console.log(`Validated ${rows.length} unique products; no database connection made.`);
    return;
  }
  loadEnvConfig(process.cwd());
  const config = getSupabaseConfiguration();
  if (!config) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) before seeding.");
  for (let offset = 0; offset < rows.length; offset += 200) {
    const batch = rows.slice(offset, offset + 200).map((row) => ({
      ...row,
      cut_level: row.cut_level ?? null,
      nrr: row.nrr ?? null,
      hivis_class: row.hivis_class ?? null,
      pack: row.pack ?? null,
      note: row.note ?? null,
    }));
    await supabaseRequest(config, "products?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(batch),
    });
  }
  console.log(`Upserted ${rows.length} products. Existing IDs updated; other products and click history retained.`);
}

main().catch((error: unknown) => {
  // Do not print raw transport errors or environment values.
  console.error(error instanceof z.ZodError ? "Catalog or CLI validation failed." :
    error instanceof Error ? error.message : "Seed failed.");
  process.exitCode = 1;
});
