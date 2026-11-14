import { getDealAlerts } from "@/lib/api/client";
import { priceDropRows } from "@/lib/price-drops";
import type { SavedKit } from "@/lib/saved-kits";

/** Quiet, bounded checks; getDealAlerts keeps the existing API timeout and validation. */
export async function loadKitPriceDrops(
  kits: readonly Pick<SavedKit, "slug">[],
  isPro: boolean,
  accessToken: string | null,
): Promise<Record<string, number>> {
  if (!isPro || !accessToken) return {};
  const slugs = [...new Set(kits.flatMap((kit) => kit.slug ? [kit.slug] : []))].slice(0, 10);
  const results = await Promise.allSettled(slugs.map(async (slug) => {
    const out = await getDealAlerts(slug, accessToken);
    if (out.kind !== "ok") return null;
    const saving = priceDropRows(out.data.deals, slug).reduce((sum, row) => sum + row.savingCents, 0);
    return saving > 0 ? [slug, saving] as const : null;
  }));
  return Object.fromEntries(results.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  ));
}
