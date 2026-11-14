"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildIcs } from "@/lib/ics";
import type { Category, KitResult, Pick } from "@/lib/types";

export type ViewPick = Pick & { url: string };
export interface ViewItem {
  label: string;
  category: Category;
  optionsConsidered: number;
  pick: ViewPick;
  alternatives: { label: string; pick: ViewPick }[];
}

const ICONS: Record<Category, string> = {
  boots: "🥾", gloves: "🧤", eyewear: "🥽", hearing: "🎧", head: "⛑️", hivis: "🦺", outerwear: "🧥", shirt: "👕", pants: "👖",
};

const usd = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function KitView({ token, kit, items }: { token: string; kit: KitResult; items: ViewItem[] }) {
  // Index of the chosen option per item: -1 is GearFit's pick, otherwise an alternative.
  const [choice, setChoice] = useState<number[]>(() => items.map(() => -1));
  const [copied, setCopied] = useState(false);

  const chosen = items.map((it, i) => (choice[i] === -1 ? it.pick : it.alternatives[choice[i]].pick));
  const totals = useMemo(() => {
    const upfront = chosen.reduce((s, p) => s + p.product.price, 0);
    const perMonth = chosen.reduce((s, p) => s + p.costPerMonth, 0);
    return { upfront, perMonth, perYear: perMonth * 12 };
  }, [chosen]);
  const savingsPerYear = kit.totals.cheapestPerYear - totals.perYear;
  const extraToday = totals.upfront - kit.totals.cheapestUpfront;

  const a = kit.answers;
  const chips = [
    `${a.hoursPerWeek} h/week`,
    { hot: "Hot climate", mild: "Mild climate", cold: "Cold climate", wet: "Rainy climate" }[a.climate],
    a.shoeSize && `Shoe ${a.shoeSize}`,
    a.clothingSize && `Size ${a.clothingSize}`,
    { value: "Lowest price", balanced: "Best value", premium: "Best quality" }[a.budget],
    a.maxBudget && `Max ${usd(a.maxBudget)}`,
  ].filter(Boolean) as string[];

  async function share() {
    const url = `${window.location.origin}/kit?k=${token}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `My ${kit.tradeLabel} kit on GearFit`, url });
        return;
      }
    } catch {
      /* user cancelled the share sheet; fall back to copying */
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadReminders() {
    const ics = buildIcs(
      chosen.map((p) => ({
        title: `Replace: ${p.product.brand} ${p.product.name}`,
        description: `Your ${p.product.name} is due for replacement (about ${p.lifespanMonths} months of wear). Reorder: ${p.url}`,
        url: p.url,
        monthsFromNow: p.lifespanMonths,
      })),
    );
    const blob = new Blob([ics], { type: "text/calendar" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "gearfit-replacements.ics";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-600">Your kit</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{kit.tradeLabel}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{c}</span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button onClick={share} className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900">
            {copied ? "Link copied ✓" : "Share kit"}
          </button>
          <button onClick={downloadReminders} className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold dark:border-zinc-700">
            Add replacement reminders
          </button>
          <Link href={`/build?trade=${a.trade}`} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
            Edit answers
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Pay today" value={usd(totals.upfront)} sub={`${items.length} items`} />
        <Stat label="Real cost" value={`${usd(totals.perMonth, 2)}/mo`} sub={`${usd(totals.perYear)} per year of wear`} highlight />
        {savingsPerYear > 1 ? (
          <Stat
            label="vs. cheapest gear"
            value={`Save ${usd(savingsPerYear)}/yr`}
            sub={extraToday > 0 ? `Pay ${usd(extraToday)} more today, replace less often` : "And cheaper today too"}
          />
        ) : (
          <Stat label="vs. cheapest gear" value={usd(kit.totals.cheapestUpfront)} sub="Cheapest compliant kit today" />
        )}
      </div>

      {kit.warnings.length > 0 && (
        <div className="mt-6 space-y-2">
          {kit.warnings.map((w) => (
            <p key={w} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              ⚠️ {w}
            </p>
          ))}
        </div>
      )}

      <div className="mt-8 space-y-4">
        {items.map((item, i) => {
          const pick = chosen[i];
          const options = [{ label: "GearFit pick", pick: item.pick }, ...item.alternatives];
          return (
            <article key={item.label + i} className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-2xl dark:bg-zinc-800" aria-hidden>
                    {ICONS[item.category]}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{item.label}</p>
                    <h2 className="mt-0.5 text-lg font-semibold leading-snug">
                      {pick.product.brand} {pick.product.name}
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {pick.product.standards.map((s) => (
                        <span key={s} className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">{s}</span>
                      ))}
                      {pick.product.gender !== "unisex" && (
                        <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{pick.product.gender === "men" ? "Men's" : "Women's"}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-5 sm:text-right">
                  <div>
                    <p className="text-xl font-bold">{usd(pick.product.price)}</p>
                    {pick.product.pack && <p className="text-xs text-zinc-500">{pick.product.pack}</p>}
                  </div>
                  <div>
                    <p className="text-xl font-bold text-amber-600">{usd(pick.costPerMonth, 2)}</p>
                    <p className="text-xs text-zinc-500">/mo · lasts ~{pick.lifespanMonths} mo</p>
                  </div>
                </div>
              </div>

              {pick.reasons.length > 0 && (
                <ul className="mt-4 space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                  {pick.reasons.slice(0, 4).map((r) => (
                    <li key={r} className="flex gap-2"><span className="text-emerald-600">✓</span><span>{r}</span></li>
                  ))}
                </ul>
              )}
              {pick.missing.length > 0 && (
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Missing: {pick.missing.join(", ")}</p>
              )}
              {pick.product.note && <p className="mt-2 text-sm text-zinc-500">💡 {pick.product.note}</p>}

              <div className="mt-5 flex flex-col gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between print:hidden">
                <div className="flex flex-wrap gap-2">
                  {options.length > 1 &&
                    options.map((o, j) => {
                      const active = choice[i] === j - 1;
                      return (
                        <button
                          key={o.pick.product.id}
                          onClick={() => setChoice((c) => c.map((v, k) => (k === i ? j - 1 : v)))}
                          className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                            active ? "border-amber-500 bg-amber-50 dark:bg-amber-500/10" : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700"
                          }`}
                          title={`${o.pick.product.brand} ${o.pick.product.name}`}
                        >
                          <span className="block font-semibold">{o.label}</span>
                          <span className="text-zinc-500">{usd(o.pick.product.price)} · {usd(o.pick.costPerMonth, 2)}/mo</span>
                        </button>
                      );
                    })}
                </div>
                <a
                  href={pick.url}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-center text-sm font-bold text-zinc-950 hover:bg-amber-400"
                >
                  Find best price →
                </a>
              </div>
              <p className="mt-2 text-xs text-zinc-400">Chosen from {item.optionsConsidered} compliant option{item.optionsConsidered === 1 ? "" : "s"}</p>
            </article>
          );
        })}
      </div>

      {kit.standards.length > 0 && (
        <section className="mt-10 rounded-2xl bg-zinc-50 p-6 dark:bg-zinc-900">
          <h2 className="font-semibold">Standards this kit covers</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {kit.standards.map((s) => (
              <span key={s} className="rounded-full border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700">{s}</span>
            ))}
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            Prices are approximate and change often; lifespans are GearFit estimates at your hours. Always confirm specs on the product page and with your site&apos;s safety rules. GearFit may earn a commission from retailer links.
          </p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 ${highlight ? "bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950" : "border border-zinc-200 dark:border-zinc-800"}`}>
      <p className={`text-xs font-semibold uppercase tracking-wider ${highlight ? "opacity-70" : "text-zinc-500"}`}>{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className={`mt-1 text-sm ${highlight ? "opacity-70" : "text-zinc-500"}`}>{sub}</p>
    </div>
  );
}
