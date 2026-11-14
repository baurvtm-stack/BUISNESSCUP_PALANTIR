/**
 * URL helpers. A kit is fully described by its answers token (`k`) plus the products the
 * shopper swapped in (`c`, one product id per item position, empty = GearFit's pick), so
 * every kit link is permanent and needs no account.
 */

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export function encodeChoices(choices: (string | null | undefined)[]): string {
  const clean = choices.map((c) => (c && ID_RE.test(c) ? c : ""));
  return clean.some(Boolean) ? clean.join(",").replace(/,+$/, "") : "";
}

export function decodeChoices(raw: string | undefined | null, length?: number): string[] {
  const list = (raw ?? "")
    .slice(0, 2000)
    .split(",")
    .map((c) => (ID_RE.test(c) ? c : ""));
  if (length === undefined) return list;
  return Array.from({ length }, (_, i) => list[i] ?? "");
}

export function kitHref(token: string, opts: { choices?: string[]; slug?: string } = {}): string {
  const params = new URLSearchParams({ k: token });
  const c = encodeChoices(opts.choices ?? []);
  if (c) params.set("c", c);
  if (opts.slug) params.set("s", opts.slug);
  return `/kit?${params.toString()}`;
}

/**
 * One kit → its three price tiers side by side. Two or three kits → those kits side by side
 * (each `k` is paired with the `c` at the same position, so swaps survive).
 */
export function compareHref(kits: (string | { token: string; choices?: string[] })[]): string {
  const params = new URLSearchParams();
  const list = kits.slice(0, 3).map((k) => (typeof k === "string" ? { token: k, choices: [] } : k));
  list.forEach((k) => params.append("k", k.token));
  if (list.length > 1) list.forEach((k) => params.append("c", encodeChoices(k.choices ?? [])));
  return `/compare?${params.toString()}`;
}

/** Outbound retailer link, routed through /go so the click is logged and tagged. */
export function goHref(productId: string, kitSlug?: string): string {
  return `/go/${encodeURIComponent(productId)}${kitSlug ? `?kit=${encodeURIComponent(kitSlug)}` : ""}`;
}

export function shortKitHref(slug: string): string {
  return `/k/${encodeURIComponent(slug)}`;
}
