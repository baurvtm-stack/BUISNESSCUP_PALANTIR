import { NextResponse } from "next/server";
import { getProduct } from "@/lib/server/catalog";
import { affiliateUrl, clickSchema, logClick } from "@/lib/server/clicks";
import { InvalidBodyError, readJsonBody } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

async function clickResponse(input: unknown, redirect: boolean) {
  const parsed = clickSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Invalid click input" }, { status: 400, headers });
  try {
    const product = await getProduct(parsed.data.productId);
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404, headers });
    const redirectUrl = affiliateUrl(product);
    const tracked = await logClick(parsed.data);
    if (redirect) return new NextResponse(null, { status: 302, headers: { ...headers, Location: redirectUrl } });
    return NextResponse.json({ redirectUrl, tracked }, { headers });
  } catch {
    return NextResponse.json({ error: "Click storage is temporarily unavailable" }, { status: 503, headers });
  }
}

/** POST logs before returning the destination; callers navigate to redirectUrl. */
export async function POST(request: Request) {
  try {
    return await clickResponse(await readJsonBody(request), false);
  } catch (error) {
    if (error instanceof InvalidBodyError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    return NextResponse.json({ error: "Invalid click input" }, { status: 400, headers });
  }
}

/** Existing buyUrl anchors can track clicks without changing frontend-owned components. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (new Set(params.keys()).size !== [...params.keys()].length) {
    return NextResponse.json({ error: "Duplicate query parameters" }, { status: 400, headers });
  }
  return clickResponse(Object.fromEntries(params), true);
}
