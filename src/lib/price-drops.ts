import type { CatalogDeal } from "@/lib/api/contract";
import { usd } from "@/lib/format";
import { goHref } from "@/lib/kit-url";

function price(cents: number): string {
  return usd(cents / 100, cents % 100 === 0 ? 0 : 2);
}

export function formatSaving(cents: number): string {
  return `−${price(cents)}`;
}

/** Compare in cents so the displayed saving matches the two displayed prices. */
export function priceDropRows(deals: readonly CatalogDeal[], kitSlug: string) {
  return deals.flatMap((deal) => {
    const saved = Math.round(deal.savedPrice * 100);
    const current = Math.round(deal.currentPrice * 100);
    const savingCents = saved - current;
    if (savingCents <= 0) return [];
    return [{
      productId: deal.productId,
      name: deal.name,
      now: `now ${price(current)}`,
      was: `was ${price(saved)}`,
      saving: formatSaving(savingCents),
      savingCents,
      href: goHref(deal.productId, kitSlug),
    }];
  });
}
