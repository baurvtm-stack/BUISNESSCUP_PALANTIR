import { writeFileSync } from "node:fs";
import catalog from "../src/data/catalog.json";
import { catalogSchema } from "../src/lib/catalog-schema";
import { retailerLinksSql } from "../src/lib/retailer-links";

// Regenerates the SQL Editor script that copies catalog.json's retailer links into Supabase.
const output = "supabase/manufacturer-links.sql";
const rows = catalogSchema.parse(catalog);
writeFileSync(output, retailerLinksSql(rows));
process.stdout.write(`Wrote ${output} for ${rows.length} products.\n`);
