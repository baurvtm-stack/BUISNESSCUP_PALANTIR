import type { Metadata } from "next";
import { findProduct } from "@/lib/server/kit-view";
import GoRedirect from "./GoRedirect";

export const metadata: Metadata = {
  title: "Opening the retailer",
  robots: { index: false, follow: false },
};

/**
 * Outbound retailer hop: logs the click via POST /api/click (which returns the maker page,
 * a tagged Amazon fallback, or a US price comparison outside the US), then forwards.
 * Falls back to the click redirect if the API is down.
 */
export default async function GoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kit?: string }>;
}) {
  const [{ id }, { kit }] = await Promise.all([params, searchParams]);
  const found = await findProduct(id);
  return (
    <GoRedirect
      productId={id}
      kitId={kit && /^[\w-]{1,2000}$/.test(kit) ? kit : undefined}
      fallbackUrl={found?.url ?? null}
      name={found ? `${found.product.brand} ${found.product.name}` : null}
    />
  );
}
