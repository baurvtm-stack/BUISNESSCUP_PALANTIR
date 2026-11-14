import { z } from "zod";
import type { CategoryResult } from "../../../../lib/types";
import { ApiError, db, handle, json, rateLimit, readJson } from "../../../../lib/retention/core";
import { kitSlugSchema, requirePro } from "../../../../lib/retention/billing";

export const runtime = "nodejs";
const schema = z.object({ kitSlug: kitSlugSchema, productId: z.string().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "Invalid date"),
  hours: z.number().min(0).max(24) }).strict();

export async function POST(request: Request) {
  return handle(async () => {
    await rateLimit(request, "wear", 60);
    const pro = await requirePro(request);
    const input = await readJson(request, schema);
    if (input.date > new Date().toISOString().slice(0, 10)) throw new ApiError(400, "Wear date cannot be in the future");
    const { data: kit, error } = await db().from("kits").select("items").eq("slug", input.kitSlug).maybeSingle();
    if (error) throw new ApiError(503, "Kit lookup unavailable");
    if (!kit || !(kit.items as CategoryResult[]).some(item => item.pick.product.id === input.productId)) throw new ApiError(404, "Kit item not found");
    const { error: saveError } = await db().from("wear_entries").upsert({ checkout_id: pro.checkoutId,
      kit_slug: input.kitSlug, product_id: input.productId, worn_on: input.date, hours: input.hours },
    { onConflict: "checkout_id,kit_slug,product_id,worn_on" });
    if (saveError) throw new ApiError(503, "Wear tracking unavailable");
    return json({ saved: true });
  });
}

export async function GET(request: Request) {
  return handle(async () => {
    const pro = await requirePro(request);
    const kitSlug = kitSlugSchema.parse(new URL(request.url).searchParams.get("kitSlug"));
    const { data, error } = await db().from("wear_entries").select("product_id,worn_on,hours")
      .eq("checkout_id", pro.checkoutId).eq("kit_slug", kitSlug).order("worn_on", { ascending: false }).limit(1000);
    if (error) throw new ApiError(503, "Wear tracking unavailable");
    return json({ entries: data });
  });
}
