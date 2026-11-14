import { NextResponse } from "next/server";
import { PRODUCTS, buyUrl } from "@/data/products";
import { TRADES } from "@/data/trades";
import { HAZARDS } from "@/data/hazards";

/** GET /api/catalog?category=boots: the product catalog with buy links. */
export function GET(req: Request) {
  const category = new URL(req.url).searchParams.get("category");
  const products = PRODUCTS.filter((p) => !category || p.category === category).map((p) => ({ ...p, url: buyUrl(p) }));
  return NextResponse.json({
    count: products.length,
    products,
    trades: TRADES,
    hazards: HAZARDS.map(({ id, label }) => ({ id, label })),
  });
}
