import { after, NextResponse } from "next/server";
import { getClickProduct } from "@/lib/server/click-catalog";
import { clickSchema, logClick, outboundUrl, visitorCountry } from "@/lib/server/clicks";
import { InvalidBodyError, readJsonBody } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

async function clickResponse(input: unknown, redirect: boolean, country: string | null) {
  const parsed = clickSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Invalid click input" }, { status: 400, headers });
  try {
    const product = await getClickProduct(parsed.data.productId);
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404, headers });
    const redirectUrl = outboundUrl(product, country);
    if (redirect) {
      after(async () => {
        // Analytics must never prevent a shopper reaching the retailer.
        await logClick(parsed.data).catch(() => false);
      });
      return new NextResponse(null, { status: 302, headers: { ...headers, Location: redirectUrl } });
    }
    const tracked = await logClick(parsed.data).catch(() => false);
    return NextResponse.json({ redirectUrl, tracked }, { headers });
  } catch {
    return NextResponse.json({ error: "Click storage is temporarily unavailable" }, { status: 503, headers });
  }
}

/** POST reports whether storage accepted the event; the destination survives insert failures. */
export async function POST(request: Request) {
  try {
    return await clickResponse(await readJsonBody(request), false, visitorCountry(request));
  } catch (error) {
    if (error instanceof InvalidBodyError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    return NextResponse.json({ error: "Invalid click input" }, { status: 400, headers });
  }
}

/** Existing buyUrl anchors can track clicks without changing frontend-owned components. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (["productId", "kitId"].some(key => params.getAll(key).length > 1)) {
    return NextResponse.json({ error: "Duplicate query parameters" }, { status: 400, headers });
  }
  // Marketing/link-decoration parameters are unrelated to validated click input.
  return clickResponse({
    productId: params.get("productId"),
    ...(params.has("kitId") ? { kitId: params.get("kitId") } : {}),
  }, true, visitorCountry(request));
}
