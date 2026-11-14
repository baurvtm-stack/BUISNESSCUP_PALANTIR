import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const folder = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(folder)
  .filter((name) => /^2026111410000[1-4]_.*\.sql$/.test(name))
  .sort();
if (files.length !== 4)
  throw new Error("Expected exactly four retention migrations");
const sql =
  "-- Apply once, after the catalog/click migrations. No retention migrations may already be applied.\nBEGIN;\n\n" +
  files
    .map(
      (name) =>
        `-- ${name}\n${readFileSync(new URL(name, folder), "utf8").replace(/\r\n/g, "\n").trim()}\n`,
    )
    .join("\n") +
  "\nNOTIFY pgrst, 'reload schema';\nCOMMIT;\n";
const output = new URL("../supabase/retention-setup.sql", import.meta.url);
writeFileSync(output, sql);
process.stdout.write(`Generated ${fileURLToPath(output)}\n`);
