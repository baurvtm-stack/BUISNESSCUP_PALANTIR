import Link from "next/link";
import { PRODUCTS } from "@/data/products";
import { TRADES } from "@/data/trades";
import { effectiveLifespan, recommend } from "@/lib/engine";

const usd = (n: number, d = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });

export default function Home() {
  const example = recommend({
    trade: "electrician",
    extraHazards: [],
    climate: "mild",
    gender: "men",
    hoursPerWeek: 45,
    budget: "balanced",
    employer: [],
  });
  const cheap = PRODUCTS.find((p) => p.id === "cat-second-shift")!;
  const good = PRODUCTS.find((p) => p.id === "thorogood-moc")!;
  const perMonth = (p: typeof cheap) => p.price / effectiveLifespan(p, 45);

  return (
    <main>
      <section className="px-4 pb-16 pt-14 sm:pt-24">
        <div className="mx-auto max-w-5xl">
          <p className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
            For US tradespeople who buy their own gear
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            The right work gear for your trade. <span className="text-amber-500">Bought once.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
            Answer 5 quick questions. GearFit builds a boots-to-hard-hat kit that meets the OSHA, ASTM and ANSI standards your job
            actually calls for, and shows what each piece really costs you per month of wear.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/build" className="rounded-xl bg-amber-500 px-7 py-3.5 text-base font-bold text-zinc-950 shadow-sm hover:bg-amber-400">
              Build my kit in 2 minutes →
            </Link>
            <span className="text-sm text-zinc-500">Free. No sign-up.</span>
          </div>
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-zinc-50 px-4 py-14 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Cheap boots are the expensive ones</h2>
            <p className="mt-3 text-zinc-600 dark:text-zinc-400">
              OSHA does not require employers to pay for standard safety-toe boots or everyday work clothes (29 CFR 1910.132(h)), so most
              workers pay out of pocket and guess. The sticker price hides the real number: how long it lasts.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[cheap, good].map((p, i) => (
              <div key={p.id} className={`rounded-2xl p-5 ${i === 1 ? "bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950" : "border border-zinc-300 dark:border-zinc-700"}`}>
                <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{i === 0 ? "Budget boot" : "Resoleable boot"}</p>
                <p className="mt-2 text-sm font-medium leading-snug">{p.brand} {p.name}</p>
                <p className="mt-4 text-3xl font-bold">{usd(p.price)}</p>
                <p className="text-sm opacity-70">lasts ~{effectiveLifespan(p, 45)} months</p>
                <p className="mt-4 text-xl font-bold">{usd(perMonth(p), 2)}/mo</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-bold tracking-tight">Pick your trade</h2>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">We start from the hazards on your job site and work backward to the gear.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TRADES.map((t) => (
              <Link
                key={t.id}
                href={`/build?trade=${t.id}`}
                className="group rounded-xl border border-zinc-200 p-4 transition hover:border-amber-500 dark:border-zinc-800"
              >
                <span className="flex items-center justify-between font-semibold">
                  {t.label}
                  <span className="text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-amber-500">→</span>
                </span>
                <span className="mt-1 block text-sm text-zinc-500">{t.blurb}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {[
            ["1. Tell us about the job", "Trade, hazards, climate, hours and what your employer requires."],
            ["2. Get a compliant kit", "Every pick is matched to a real standard: ASTM F2413, ANSI Z87.1+, Z89.1, ISEA 105 and 107, NFPA 70E."],
            ["3. Buy smart, replace on time", "See cost per month, swap options, share the kit, and add replacement reminders to your calendar."],
          ].map(([t, d]) => (
            <div key={t}>
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{d}</p>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-12 max-w-5xl rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Example: electrician, 45 h/week</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <p className="max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
              {example.items.map((i) => `${i.pick.product.brand} ${i.pick.product.name}`).join(" · ")}
            </p>
            <div className="text-right">
              <p className="text-2xl font-bold">{usd(example.totals.upfront)} <span className="text-base font-normal text-zinc-500">today</span></p>
              <p className="font-semibold text-amber-600">{usd(example.totals.perMonth, 2)}/month of wear</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
