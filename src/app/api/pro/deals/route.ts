import { z } from "zod";
import type { CategoryResult } from "@/lib/types";
import {
  ApiError,
  db,
  handle,
  json,
  rateLimit,
  readJson,
} from "@/lib/retention/core";
import { findDeals, kitSlugSchema, requirePro } from "@/lib/retention/billing";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimit(request, "deal-alerts", 30);
    const pro = await requirePro(request);
    const input = await readJson(
      request,
      z.object({ kitSlug: kitSlugSchema, enabled: z.boolean() }).strict(),
    );
    const { data: kit, error } = await db()
      .from("kits")
      .select("id")
      .eq("slug", input.kitSlug)
      .maybeSingle();
    if (error) throw new ApiError(503, "Kit lookup unavailable");
    if (!kit) throw new ApiError(404, "Kit not found");
    if (input.enabled) {
      const { data: reminder, error: consentError } = await db()
        .from("reminders")
        .select("id")
        .eq("email", pro.email)
        .eq("kit_id", kit.id)
        .not("confirmed_at", "is", null)
        .is("unsubscribed_at", null)
        .maybeSingle();
      if (consentError) throw new ApiError(503, "Reminder lookup unavailable");
      if (!reminder)
        throw new ApiError(
          409,
          "Confirm replacement reminders for this email and kit before enabling deal alerts",
        );
    }
    const { error: saveError } = await db()
      .from("pro_deal_alerts")
      .upsert(
        {
          checkout_id: pro.checkoutId,
          email: pro.email,
          kit_slug: input.kitSlug,
          enabled: input.enabled,
        },
        { onConflict: "checkout_id,kit_slug" },
      );
    if (saveError) throw new ApiError(503, "Deal alerts unavailable");
    return json({ enabled: input.enabled });
  });
}

export async function GET(request: Request) {
  return handle(async () => {
    await requirePro(request);
    const kitSlug = kitSlugSchema.parse(
      new URL(request.url).searchParams.get("kitSlug"),
    );
    const { data: kit, error } = await db()
      .from("kits")
      .select("items")
      .eq("slug", kitSlug)
      .maybeSingle();
    if (error) throw new ApiError(503, "Kit lookup unavailable");
    if (!kit) throw new ApiError(404, "Kit not found");
    return json({
      deals: findDeals(kit.items as CategoryResult[]),
      source: "catalog_estimates",
    });
  });
}
