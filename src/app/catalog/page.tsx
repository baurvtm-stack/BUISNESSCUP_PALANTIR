import type { Metadata } from "next";
import Link from "next/link";
import { Icon, categoryIcon } from "@/components/icons";
import { Eyebrow, StandardBadge } from "@/components/ui";
import { usd } from "@/lib/format";
import { goHref } from "@/lib/kit-url";
import { CATEGORIES, getCatalog } from "@/lib/server/kit-view";

export const metadata: Metadata = {
  title: "Gear catalog",
  description: "Work boots, gloves, eyewear, hearing protection, hard hats and workwear, sorted by real cost per month.",
};

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const catalog = await getCatalog();
  const active = CATEGORIES.find((cat) => cat.id === c)?.id ?? null;
  const list = catalog.filter((p) => !active || p.category === active).sort((a, b) => a.costPerMonth - b.costPerMonth);

  return (
    <main className="flex-1 pb-16 pt-6 sm:pt-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Eyebrow>Catalog</Eyebrow>
        <h1 className="mt-2 font-display text-5xl font-extrabold tracking-tight sm:text-6xl">Every item, by cost per month</h1>
        <p className="mt-3 max-w-2xl text-lg text-ink-2">
          {catalog.length} items from {new Set(catalog.map((p) => p.brand)).size} brands, sorted by what they really cost per month at
          40 hours a week.
        </p>

        <nav aria-label="Categories" className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Tab href="/catalog" active={!active}>
            All
          </Tab>
          {CATEGORIES.map((cat) => (
            <Tab key={cat.id} href={`/catalog?c=${cat.id}`} active={active === cat.id}>
              {cat.label}
            </Tab>
          ))}
        </nav>

        <ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((p) => (
            <li key={p.id} className="flex gap-3.5 rounded-2xl border border-line bg-card p-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sunken" aria-hidden>
                <Icon name={categoryIcon(p.category)} className="size-6" strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                  {p.categoryLabel}
                  {p.gender !== "unisex" && ` · ${p.gender === "men" ? "Men's" : "Women's"}`}
                  {p.pack && ` · ${p.pack}`}
                </p>
                <a
                  href={goHref(p.id)}
                  target="_blank"
                  rel="noopener sponsored"
                  className="mt-0.5 block font-semibold leading-snug hover:text-accent-ink"
                >
                  {p.brand} {p.name}
                </a>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.standards.map((s) => (
                    <StandardBadge key={s}>{s}</StandardBadge>
                  ))}
                </div>
                <p className="tabular mt-3 flex flex-wrap items-baseline gap-x-3 text-sm text-ink-3">
                  <span className="font-semibold text-ink">{usd(p.price)}</span>
                  <span>lasts ~{p.lifespanMonths} mo</span>
                  <span className="ml-auto font-display text-xl font-bold text-accent-ink">{usd(p.costPerMonth, 2)}/mo</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-ink-3">
          Prices are approximate. Also available as JSON at{" "}
          <Link href="/api/catalog" className="underline">
            /api/catalog
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition ${
        active ? "bg-ink text-paper" : "border border-line bg-card text-ink-2 hover:border-line-2"
      }`}
    >
      {children}
    </Link>
  );
}
