import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCTS, buyUrl } from "@/data/products";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/engine";
import type { Category } from "@/lib/types";

export const metadata: Metadata = { title: "Catalog | GearFit" };

const usd = (n: number, d = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const active = CATEGORY_ORDER.includes(c as Category) ? (c as Category) : null;
  const list = PRODUCTS.filter((p) => !active || p.category === active).sort(
    (a, b) => a.price / a.lifespanMonths - b.price / b.lifespanMonths,
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Catalog</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        {PRODUCTS.length} hand-picked items, sorted by real cost per month at 40 h/week.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Tab href="/catalog" active={!active}>All</Tab>
        {CATEGORY_ORDER.map((cat) => (
          <Tab key={cat} href={`/catalog?c=${cat}`} active={active === cat}>{CATEGORY_LABELS[cat]}</Tab>
        ))}
      </div>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Standards</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">Lasts</th>
              <th className="px-4 py-3 text-right">Per month</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-3">
                  <a href={buyUrl(p)} target="_blank" rel="noopener noreferrer sponsored" className="font-medium hover:text-amber-600">
                    {p.brand} {p.name}
                  </a>
                  <span className="block text-xs text-zinc-500">
                    {CATEGORY_LABELS[p.category]}
                    {p.gender !== "unisex" && ` · ${p.gender === "men" ? "Men's" : "Women's"}`}
                    {p.pack && ` · ${p.pack}`}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-400">{p.standards.join(", ")}</td>
                <td className="px-4 py-3 text-right">{usd(p.price)}</td>
                <td className="px-4 py-3 text-right">{p.lifespanMonths} mo</td>
                <td className="px-4 py-3 text-right font-semibold">{usd(p.price / p.lifespanMonths, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-zinc-500">
        Prices are approximate. Data is also available as JSON at <Link href="/api/catalog" className="underline">/api/catalog</Link>.
      </p>
    </main>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-sm ${active ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {children}
    </Link>
  );
}
