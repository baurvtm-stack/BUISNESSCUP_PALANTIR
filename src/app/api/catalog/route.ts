import { NextResponse } from "next/server";
import { buyUrl } from "@/data/products";
import { TRADES } from "@/data/trades";
import { HAZARDS } from "@/data/hazards";
import { categorySchema } from "@/lib/catalog-schema";
import { getProducts } from "@/lib/server/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/catalog?category=boots: the product catalog with buy links. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const category = categorySchema.optional().safeParse(params.get("category") || undefined);
  if (!category.success || params.getAll("category").length > 1) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  try {
    const products = (await getProducts(category.data)).map((p) => ({ ...p, url: buyUrl(p) }));
    return NextResponse.json({
      count: products.length,
      products,
      trades: TRADES,
      hazards: HAZARDS.map(({ id, label }) => ({ id, label })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Catalog is temporarily unavailable" }, { status: 503 });
  }
}
