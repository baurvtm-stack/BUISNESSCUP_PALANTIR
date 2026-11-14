import { z } from "zod";

const PRODUCTION_URL = "https://palantirbuisness.vercel.app";
const originSchema = z.url().refine((value) => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) &&
    !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
}, "Use an HTTP(S) origin without credentials, a path, query or fragment");
const productSchema = z.object({
  id: z.string().min(1),
  brand: z.string().min(1),
  name: z.string().min(1),
  retailer_url: z.url().refine((value) => new URL(value).protocol === "https:"),
});
const catalogSchema = z.object({
  count: z.number().int().positive(),
  products: z.array(productSchema).min(1),
});
const recommendationSchema = z.object({
  token: z.string().min(1),
  kit: z.object({
    answers: z.object({ trade: z.literal("electrician") }),
    items: z.array(z.object({
      pick: z.object({
        product: productSchema,
        lifespanMonths: z.number().positive(),
        costPerMonth: z.number().nonnegative(),
        why: z.string().min(1),
      }),
    })).min(1),
    totals: z.object({
      upfront: z.number().nonnegative(),
      perMonth: z.number().nonnegative(),
    }),
  }),
});

// Public questionnaire input: no account, provider credentials or mock flag.
const electrician = {
  trade: "electrician",
  extraHazards: [],
  climate: "mild",
  hoursPerWeek: 40,
  employer: [],
  gender: "men",
  shoeSize: "10.5",
  clothingSize: "L / 34x32",
  budget: "balanced",
};

async function smoke(origin) {
  let passed = 0;
  let failed = 0;
  let product;
  const request = (path, init = {}) => fetch(new URL(path, origin), {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  const check = async (name, run) => {
    try {
      const detail = await run();
      passed += 1;
      process.stdout.write(`PASS ${name}: ${detail}\n`);
    } catch (error) {
      failed += 1;
      process.stderr.write(`FAIL ${name}: ${error instanceof Error ? error.message : "check failed"}\n`);
    }
  };
  const json = async (response, schema) => {
    if (response.status !== 200) throw new Error(`expected HTTP 200, got ${response.status}`);
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("expected application/json");
    }
    const result = schema.safeParse(await response.json());
    if (!result.success) throw new Error("response does not match the API contract");
    return result.data;
  };

  process.stdout.write(`GearFit smoke: ${origin}\n`);
  await check("GET /", async () => {
    const response = await request("/");
    if (response.status !== 200) throw new Error(`expected HTTP 200, got ${response.status}`);
    if (!response.headers.get("content-type")?.includes("text/html") ||
        !/GearFit/i.test(await response.text())) {
      throw new Error("expected the GearFit HTML page");
    }
    return "HTTP 200, GearFit HTML";
  });
  await check("GET /api/catalog", async () => {
    const catalog = await json(await request("/api/catalog"), catalogSchema);
    if (catalog.count !== catalog.products.length) throw new Error("catalog count does not match products");
    product = catalog.products[0];
    return `${catalog.count} products`;
  });
  await check("POST /api/recommend", async () => {
    const recommendation = await json(await request("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(electrician),
    }), recommendationSchema);
    product = recommendation.kit.items[0].pick.product;
    return `electrician kit, ${recommendation.kit.items.length} items with costs and reasons`;
  });
  await check("GET /api/click", async () => {
    if (!product) throw new Error("no product returned by catalog or recommendation to test");
    const query = new URLSearchParams({ productId: product.id });
    const response = await request(`/api/click?${query}`);
    if (response.status !== 302) throw new Error(`expected HTTP 302, got ${response.status}`);
    const location = z.url().safeParse(response.headers.get("location"));
    if (!location.success) throw new Error("redirect has no absolute Location URL");
    const target = new URL(location.data);
    const expected = new URL(product.retailer_url);
    // Visitors outside the US get a US price comparison (src/lib/retailer-links.ts).
    const comparison = target.origin === "https://www.google.com" && target.pathname === "/search" &&
      target.searchParams.get("gl") === "us" && target.searchParams.get("q") === `${product.brand} ${product.name}`;
    if (!comparison && (target.origin !== expected.origin || target.pathname !== expected.pathname ||
        target.username || target.password)) {
      throw new Error("redirect does not match the product's retailer URL");
    }
    await response.body?.cancel();
    return `HTTP 302 to ${target.hostname}${comparison ? " (US price comparison for a visitor outside the US)" : ""} (not followed)`;
  });

  process.stdout.write(`${passed} passed, ${failed} failed\n`);
  if (failed) process.exitCode = 1;
}

try {
  const args = z.array(originSchema).max(1).parse(process.argv.slice(2));
  await smoke(new URL(args[0] ?? PRODUCTION_URL).origin);
} catch {
  process.stderr.write("FAIL setup: usage: node scripts/smoke.mjs [http(s)://host:port]\n");
  process.exitCode = 1;
}
