import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const project = `gearfit-e2e-${randomBytes(6).toString("hex")}`;
const env = {
  ...process.env,
  PLAYWRIGHT_LOCAL_SERVER: "",
  E2E_DB_PASSWORD: randomBytes(24).toString("hex"),
  E2E_JWT_SECRET: randomBytes(32).toString("hex"),
};
const composeArgs = ["compose", "-f", "e2e/compose.yml", "-p", project];
let child;
let interrupted = false;

function run(command, args, { input, capture = false } = {}) {
  return new Promise((resolveRun, reject) => {
    child = spawn(command, args, { env, stdio: [input ? "pipe" : "ignore", capture ? "pipe" : "inherit", "inherit"] });
    let output = "";
    child.stdout?.on("data", chunk => { output += chunk; });
    child.on("error", reject);
    child.stdin?.on("error", reject);
    child.on("close", code => code === 0 ? resolveRun(output.trim()) : reject(new Error(`${command} exited with ${code}`)));
    if (input) child.stdin.end(input);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    interrupted = true;
    child?.kill(signal);
  });
}

async function provision() {
  await run("docker", [...composeArgs, "up", "-d", "--wait", "--wait-timeout", "120", "db"]);
  const dir = resolve("supabase/migrations");
  const migrations = await Promise.all((await readdir(dir)).filter(name => name.endsWith(".sql")).sort()
    .map(name => readFile(resolve(dir, name), "utf8")));
  const catalog = JSON.parse(await readFile("src/data/catalog.json", "utf8"));
  const columns = [...new Set(catalog.flatMap(row => Object.keys(row)))];
  if (columns.some(name => !/^[a-z_]+$/.test(name))) throw new Error("Unexpected catalog column");
  const names = columns.join(",");
  const rows = JSON.stringify(catalog).replaceAll("'", "''");
  const sql = `create role anon; create role authenticated; create role service_role bypassrls;\n${migrations.join("\n")}\n` +
    `insert into public.products (${names}) select ${names} from jsonb_populate_recordset(null::public.products, '${rows}'::jsonb);`;
  await run("docker", [...composeArgs, "exec", "-T", "db", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { input: sql });
  await run("docker", [...composeArgs, "up", "-d", "--wait", "--wait-timeout", "120"]);
  const address = await run("docker", [...composeArgs, "port", "gateway", "80"], { capture: true });
  if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error("Expected a loopback-only database gateway");
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  const signature = createHmac("sha256", env.E2E_JWT_SECRET).update(payload).digest("base64url");
  Object.assign(env, {
    PLAYWRIGHT_LOCAL_SERVER: "1",
    SUPABASE_URL: `http://${address}`,
    SUPABASE_SECRET_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: `${payload}.${signature}`,
    APP_URL: "http://localhost:3000",
    RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
    NEXT_PUBLIC_API_MOCKS: "0",
    RESEND_API_KEY: "",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    CRON_SECRET: "",
    REMINDER_TEST_MODE: "false",
    NEXT_TELEMETRY_DISABLED: "1",
  });
  process.stdout.write("E2E: disposable PostgreSQL + PostgREST ready; real migrations and catalog loaded.\n");
}

const managed = !process.env.PLAYWRIGHT_BASE_URL;
try {
  if (managed) await provision();
  if (!interrupted) await run(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)]);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  if (managed) {
    try {
      await run("docker", [...composeArgs, "down", "--volumes", "--remove-orphans", "--timeout", "5"]);
    } catch {
      process.stderr.write(`E2E cleanup failed for disposable Compose project ${project}.\n`);
      process.exitCode = 1;
    }
  }
  if (interrupted) process.exitCode = 1;
}
