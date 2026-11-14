import type { Metadata } from "next";
import Link from "next/link";
import { Icon, categoryIcon, tradeIcon } from "@/components/icons";
import { ButtonLink, Eyebrow } from "@/components/ui";
import { decodeAnswers, DEFAULT_ANSWERS } from "@/lib/answers";
import { usd } from "@/lib/format";
import { decodeChoices, kitHref } from "@/lib/kit-url";
import { buildKit, getTrades, type KitView } from "@/lib/server/kit-view";
import type { Answers, BudgetTier } from "@/lib/types";

export const metadata: Metadata = {
  title: "Compare kits",
  description: "Lowest price today, best value and top quality versions of a work gear kit, side by side.",
};

const TIERS: { id: BudgetTier; title: string; short: string; hint: string }[] = [
  { id: "value", title: "Lowest price today", short: "the budget version", hint: "Cheapest gear that still meets every rule" },
  { id: "balanced", title: "Best value", short: "the best-value version", hint: "Lowest cost per month of wear" },
  { id: "premium", title: "Best quality", short: "the top-quality version", hint: "Top brands, longest life" },
];

interface Cell {
  label: string;
  category: string;
  productId: string;
  name: string;
  price: number;
  lifespanMonths: number;
  costPerMonth: number;
}

interface Column {
  key: string;
  title: string;
  /** How the column is named inside a sentence. */
  short: string;
  hint: string;
  href: string;
  current: boolean;
  cells: Cell[];
  upfront: number;
  perMonth: number;
  rebuysPerYear: number;
  quality: number;
}

function toColumn(kit: KitView, choices: string[], title: string, short: string, hint: string, current: boolean): Column {
  const cells: Cell[] = kit.items.map((item, i) => {
    const pick = (choices[i] && item.alternatives.find((a) => a.pick.product.id === choices[i])?.pick) || item.pick;
    return {
      label: item.label,
      category: item.category,
      productId: pick.product.id,
      name: `${pick.product.brand} ${pick.product.name}`,
      price: pick.product.price,
      lifespanMonths: pick.lifespanMonths,
      costPerMonth: pick.costPerMonth,
    };
  });
  const qualities = kit.items.map((item, i) => {
    const pick = (choices[i] && item.alternatives.find((a) => a.pick.product.id === choices[i])?.pick) || item.pick;
    return pick.product.quality;
  });
  return {
    key: `${kit.token}-${title}`,
    title,
    short,
    hint,
    href: kitHref(kit.token, { choices }),
    current,
    cells,
    upfront: cells.reduce((s, c) => s + c.price, 0),
    perMonth: Math.round(cells.reduce((s, c) => s + c.costPerMonth, 0) * 100) / 100,
    rebuysPerYear: Math.round(cells.reduce((s, c) => s + 12 / c.lifespanMonths, 0) * 10) / 10,
    quality: Math.round((qualities.reduce((s, q) => s + q, 0) / Math.max(1, qualities.length)) * 10) / 10,
  };
}

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string | string[]; c?: string | string[]; trade?: string }>;
}) {
  const sp = await searchParams;
  const tokens = list(sp.k).slice(0, 3);
  const choiceParams = list(sp.c);
  const trades = await getTrades();
  const columns: Column[] = [];
  let base: Answers | null = null;

  if (tokens.length >= 2) {
    for (const [i, token] of tokens.entries()) {
      const answers = decodeAnswers(token);
      if (!answers) continue;
      const kit = await buildKit(answers);
      const tier = TIERS.find((t) => t.id === answers.budget)!;
      columns.push(
        toColumn(
          kit,
          decodeChoices(choiceParams[i], kit.items.length),
          kit.tradeLabel,
          `the ${kit.tradeLabel.toLowerCase()} kit`,
          `${answers.hoursPerWeek} h/week · ${tier.title}`,
          false,
        ),
      );
    }
  } else {
    base = tokens[0]
      ? decodeAnswers(tokens[0])
      : sp.trade && trades.some((t) => t.id === sp.trade)
        ? { ...DEFAULT_ANSWERS, trade: sp.trade }
        : null;
    if (base) {
      for (const tier of TIERS) {
        // Tiers ignore the max-budget cap so the three versions can actually differ.
        const kit = await buildKit({ ...base, budget: tier.id, maxBudget: undefined });
        columns.push(toColumn(kit, [], tier.title, tier.short, tier.hint, tier.id === base.budget));
      }
    }
  }

  if (columns.length < 2) return <Picker trades={trades} />;

  const tiersMode = tokens.length < 2;
  const tradeLabel = trades.find((t) => t.id === base?.trade)?.label;
  const cheapest = columns.reduce((a, b) => (b.upfront < a.upfront ? b : a));
  const leanest = columns.reduce((a, b) => (b.perMonth < a.perMonth ? b : a));
  const finest = columns.reduce((a, b) => (b.quality > a.quality ? b : a));
  const badges = (c: Column) =>
    [c === cheapest && "Lowest price today", c === leanest && "Lowest cost of wear", c === finest && "Highest quality"].filter(
      (b): b is string => !!b,
    );

  // Row order: every item label in the order it first appears.
  const rows: { label: string; category: string }[] = [];
  for (const col of columns) {
    for (const cell of col.cells) if (!rows.some((r) => r.label === cell.label)) rows.push({ label: cell.label, category: cell.category });
  }

  return (
    <main className="flex-1 pb-16 pt-6 sm:pt-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Eyebrow>{tiersMode ? "Compare price tiers" : "Compare kits"}</Eyebrow>
        <h1 className="mt-2 font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
          {tiersMode ? `${tradeLabel ?? "Your"} kit, three ways` : "Your kits side by side"}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-2">{insight(columns, cheapest, leanest)}</p>

        <section aria-label="Totals" className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
          <MeterList title="Pay today" columns={columns} value={(c) => c.upfront} format={(v) => usd(v)} />
          <MeterList title="Cost of wear per month" columns={columns} value={(c) => c.perMonth} format={(v) => usd(v, 2)} />
          <MeterList title="Items to rebuy per year" columns={columns} value={(c) => c.rebuysPerYear} format={(v) => v.toFixed(1)} />
        </section>

        <section aria-label="Kits" className={`mt-6 grid grid-cols-1 gap-3 ${columns.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          {columns.map((c) => (
            <div key={c.key} className={`flex flex-col rounded-3xl border bg-card p-5 ${c.current ? "border-accent ring-2 ring-accent/25" : "border-line"}`}>
              <div className="flex flex-wrap gap-1.5">
                {c.current && <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#15171a]">Your pick</span>}
                {badges(c).map((b) => (
                  <span key={b} className="rounded-md bg-ok-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ok">
                    {b}
                  </span>
                ))}
              </div>
              <h2 className="mt-3 font-display text-3xl font-bold leading-none">{c.title}</h2>
              <p className="mt-1.5 text-sm text-ink-3">{c.hint}</p>
              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4">
                <Fig label="Today" value={usd(c.upfront)} />
                <Fig label="Per month" value={usd(c.perMonth, 2)} />
                <Fig label="Quality" value={`${c.quality}/10`} />
              </dl>
              <div className="mt-auto pt-5">
                <ButtonLink href={c.href} variant={c.current ? "primary" : "outline"} size="sm" className="w-full" iconRight="arrowRight">
                  Open this kit
                </ButtonLink>
              </div>
            </div>
          ))}
        </section>

        <section aria-label="Item by item" className="mt-10">
          <h2 className="font-display text-3xl font-bold">Item by item</h2>
          <p className="mt-1 text-sm text-ink-3">Rows marked “differs” are where the versions pick different gear.</p>
          <div className="mt-5 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
            <div className={`hidden gap-4 bg-sunken px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink-3 md:grid ${gridCols(columns.length)}`}>
              <span>Item</span>
              {columns.map((c) => (
                <span key={c.key}>{c.title}</span>
              ))}
            </div>
            {rows.map((row) => {
              const cells = columns.map((c) => c.cells.find((x) => x.label === row.label));
              const differs = new Set(cells.map((x) => x?.productId ?? "none")).size > 1;
              return (
                <div key={row.label} className={`grid grid-cols-1 gap-3 px-5 py-4 md:gap-4 ${gridCols(columns.length)}`}>
                  <div className="flex items-center gap-2.5 md:items-start">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken" aria-hidden>
                      <Icon name={categoryIcon(row.category)} className="size-[18px]" />
                    </span>
                    <span className="font-semibold leading-tight">
                      {row.label}
                      {differs && (
                        <span className="ml-2 rounded bg-accent-soft px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-wide text-accent-ink">
                          Differs
                        </span>
                      )}
                    </span>
                  </div>
                  {differs ? (
                    cells.map((cell, i) => (
                      <div key={columns[i].key} className="rounded-xl bg-sunken/70 px-3 py-2.5 md:bg-transparent md:p-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 md:hidden">{columns[i].title}</p>
                        {cell ? <CellText cell={cell} /> : <p className="text-sm text-ink-3">Not in this kit</p>}
                      </div>
                    ))
                  ) : (
                    <div className={`rounded-xl bg-sunken/70 px-3 py-2.5 md:bg-transparent md:p-0 ${columns.length === 3 ? "md:col-span-3" : "md:col-span-2"}`}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Same in every version</p>
                      {cells[0] && <CellText cell={cells[0]} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink-3">
            Every version meets the same safety requirements. Quality is GearFit&apos;s 1-10 score for build, materials and warranty.
            Prices are approximate.
          </p>
        </section>
      </div>
    </main>
  );
}

function CellText({ cell }: { cell: Cell }) {
  return (
    <>
      <p className="text-sm font-medium leading-snug">{cell.name}</p>
      <p className="tabular mt-0.5 text-xs text-ink-3">
        {usd(cell.price)} · lasts ~{Math.round(cell.lifespanMonths)} mo ·{" "}
        <span className="font-semibold text-ink-2">{usd(cell.costPerMonth, 2)}/mo</span>
      </p>
    </>
  );
}

function gridCols(n: number) {
  return n === 3 ? "md:grid-cols-[minmax(0,0.8fr)_repeat(3,minmax(0,1fr))]" : "md:grid-cols-[minmax(0,0.8fr)_repeat(2,minmax(0,1fr))]";
}

/** One plain-language sentence comparing the cheapest-today and cheapest-to-wear options. */
function insight(columns: Column[], cheapest: Column, leanest: Column): string {
  if (cheapest === leanest) {
    const name = cheapest.short.charAt(0).toUpperCase() + cheapest.short.slice(1);
    return `${name} is both the cheapest today and the cheapest to wear, at ${usd(cheapest.upfront)} up front and ${usd(cheapest.perMonth, 2)} a month.`;
  }
  const extra = leanest.upfront - cheapest.upfront;
  const savedPerYear = (cheapest.perMonth - leanest.perMonth) * 12;
  const fewer = cheapest.rebuysPerYear - leanest.rebuysPerYear;
  return (
    `Going with ${leanest.short} costs ${usd(extra)} more today than ${cheapest.short}, then ${usd(savedPerYear)} less a year to wear` +
    (fewer >= 1 ? `, with about ${Math.round(fewer)} fewer items to rebuy each year.` : ".") +
    (columns.length > 2 ? " Every version meets the same safety rules." : "")
  );
}

function MeterList({
  title,
  columns,
  value,
  format,
}: {
  title: string;
  columns: Column[];
  value: (c: Column) => number;
  format: (v: number) => string;
}) {
  const values = columns.map(value);
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values);
  return (
    <figure className="rounded-3xl border border-line bg-card p-5">
      <figcaption className="text-sm font-semibold text-ink-2">{title}</figcaption>
      <ul className="mt-4 space-y-3">
        {columns.map((c, i) => {
          const v = values[i];
          const best = v === min;
          return (
            <li key={c.key} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3" title={`${c.title}: ${format(v)}`}>
              <span className={`truncate text-xs ${best ? "font-semibold text-ink" : "text-ink-3"}`}>{c.title}</span>
              <span className="h-2.5" aria-hidden>
                <span
                  className={`block h-full rounded-r-[4px] ${best ? "bg-accent-ink" : "bg-ink-3/35"}`}
                  style={{ width: `${Math.max(3, (v / max) * 100)}%` }}
                />
              </span>
              <span className={`tabular text-sm ${best ? "font-bold text-ink" : "text-ink-2"}`}>{format(v)}</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className="tabular mt-0.5 font-display text-xl font-bold">{value}</dd>
    </div>
  );
}

function Picker({ trades }: { trades: { id: string; label: string; blurb: string }[] }) {
  return (
    <main className="flex-1 pb-16 pt-6 sm:pt-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Eyebrow>Compare</Eyebrow>
        <h1 className="mt-2 max-w-3xl font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
          Cheapest today, or cheapest to own?
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-2">
          Pick a trade to see the lowest-price, best-value and top-quality versions of the same kit side by side. To compare kits
          you saved, select them in{" "}
          <Link href="/kits" className="font-semibold text-accent-ink underline-offset-4 hover:underline">
            My kits
          </Link>
          .
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {trades.map((t) => (
            <Link
              key={t.id}
              href={`/compare?trade=${t.id}`}
              className="group flex items-center gap-3 rounded-2xl border border-line bg-card p-4 transition hover:border-accent"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                <Icon name={tradeIcon(t.id)} className="size-5" />
              </span>
              <span className="font-semibold leading-snug">{t.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
