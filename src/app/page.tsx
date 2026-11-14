import Link from "next/link";
import type { ReactNode } from "react";
import { AnimatedNumber, Reveal } from "@/components/fx";
import { Icon, categoryIcon, tradeIcon, type IconName } from "@/components/icons";
import { ButtonLink, Eyebrow } from "@/components/ui";
import { cssVars } from "@/lib/css";
import { usd } from "@/lib/format";
import { compareHref, kitHref } from "@/lib/kit-url";
import { buildKit, getCatalogFacts, getTrades, getWizardData, type KitView } from "@/lib/server/kit-view";

const EXAMPLE = {
  trade: "electrician",
  extraHazards: [],
  climate: "mild",
  gender: "men",
  hoursPerWeek: 45,
  budget: "balanced",
  employer: [],
} as const;

/** The rulebooks behind every pick, shown as a slow ticker under the hero. */
const STANDARDS = [
  "ASTM F2413 safety footwear",
  "ANSI Z87.1 eye protection",
  "ANSI Z89.1 hard hats",
  "ANSI/ISEA 105 cut levels",
  "ANSI/ISEA 107 hi-vis",
  "ANSI/ISEA 138 impact gloves",
  "NFPA 70E arc flash",
  "OSHA 29 CFR 1910.132",
];

/** Hazards shown in "How it works", with the gear rules the engine derives from them. */
const SHOWCASE_HAZARDS = ["electrical", "nails_debris", "noise", "highway"];

export default async function Home() {
  const [example, facts, trades, wizard] = await Promise.all([
    buildKit({ ...EXAMPLE, extraHazards: [], employer: [] }, { live: false }),
    getCatalogFacts(EXAMPLE.hoursPerWeek),
    getTrades(),
    getWizardData(),
  ]);
  const exampleHref = kitHref(example.token);
  const showcase = SHOWCASE_HAZARDS.map((id) => wizard.hazards.find((h) => h.id === id)).filter((h) => !!h);
  const { cheapBoot, goodBoot } = facts;
  const bootGap = cheapBoot && goodBoot ? Math.round((cheapBoot.perMonth / goodBoot.perMonth - 1) * 100) : 0;

  return (
    <main>
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="blueprint pointer-events-none absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute -right-40 top-10 hidden size-[560px] rounded-full bg-accent/15 blur-[110px] sm:block" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-center lg:gap-14 lg:pb-24 lg:pt-20">
          <div className="[--rise-y:16px] [--stagger:90ms]">
            <p className="animate-rise inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-ink-2">
              <span className="relative flex size-1.5" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-70" />
                <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
              </span>
              For US tradespeople who buy their own gear
            </p>
            <h1
              className="animate-rise mt-5 font-display text-[44px] font-extrabold leading-[0.95] tracking-tight sm:text-6xl lg:text-[76px]"
              style={cssVars({ "--i": 1 })}
            >
              Stop guessing what gear passes the{" "}
              <span className="relative inline-block whitespace-nowrap text-accent-ink">
                site check.
                <svg
                  className="draw-check pointer-events-none absolute -bottom-2 left-0 h-3 w-full text-accent [--draw-d:0.8s] [--draw-t:0.7s] sm:-bottom-3 sm:h-4"
                  viewBox="0 0 300 14"
                  fill="none"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <path
                    d="M3 9.5C55 3.5 110 3 162 6.5c44 3 90 4.5 135 1"
                    pathLength={1}
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>
            <p className="animate-rise mt-6 max-w-xl text-lg leading-relaxed text-ink-2 sm:text-xl" style={cssVars({ "--i": 2 })}>
              Answer 5 questions about your trade. GearFit builds a complete kit, boots to hard hat, matched to the OSHA and
              ANSI standards your job requires, and shows what each piece really costs per month.
            </p>
            <div className="animate-rise mt-8 flex flex-col gap-3 sm:flex-row" style={cssVars({ "--i": 3 })}>
              <ButtonLink href="/build" size="lg" iconRight="arrowRight">
                Build my kit, free
              </ButtonLink>
              <ButtonLink href={exampleHref} size="lg" variant="outline">
                See an example kit
              </ButtonLink>
            </div>
            <ul className="animate-rise mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2" style={cssVars({ "--i": 4 })}>
              {["Takes 2 minutes", "No sign-up", `${facts.products} products from ${facts.brands} brands`].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Icon name="check" className="size-4 text-ok" strokeWidth={2.6} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <HeroKit kit={example} href={exampleHref} />
        </div>
      </section>

      {/* ---------- Standards ticker ---------- */}
      <div
        className="overflow-hidden border-t border-line bg-paper py-3.5 [mask-image:linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent)]"
        aria-label="Standards GearFit matches gear to"
      >
        <ul className="marquee flex w-max hover:[animation-play-state:paused]">
          {[...STANDARDS, ...STANDARDS].map((name, i) => (
            <li
              key={i}
              aria-hidden={i >= STANDARDS.length}
              className="flex shrink-0 items-center gap-2 pr-10 text-sm font-semibold uppercase tracking-[0.08em] text-ink-3"
            >
              <Icon name="shield" className="size-4 text-accent-ink" />
              {name}
            </li>
          ))}
        </ul>
      </div>

      {/* ---------- The problem ---------- */}
      <section className="border-y border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <Eyebrow>The problem</Eyebrow>
            <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-[1.02] tracking-tight sm:text-5xl">
              You pay for your gear. The rules don&apos;t make it easy.
            </h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            <PainCard
              index={0}
              icon="tag"
              stat="$0"
              title="What OSHA requires your employer to pay for standard safety-toe boots and work clothes."
              body="29 CFR 1910.132(h) puts everyday boots and workwear on you. So is getting the rating right."
            />
            <PainCard
              index={1}
              icon="alert"
              stat="EH · PR · Z87+ · A4"
              title="Ratings you have to get right before you show up."
              body="An electrician needs EH soles and a Class E hat; a roofer needs a puncture plate. The wrong rating means buying twice."
            />
            {cheapBoot && goodBoot && (
              <PainCard
                index={2}
                icon="repeat"
                stat={
                  <>
                    +<AnimatedNumber value={bootGap} kind="int" startOnView duration={1200} />%
                  </>
                }
                title={
                  cheapBoot.price === goodBoot.price
                    ? `Two pairs of ${usd(goodBoot.price)} boots. One costs that much more per month.`
                    : `More per month for ${usd(cheapBoot.price)} boots than for ${usd(goodBoot.price)} boots.`
                }
                body={`At 45 h/week the ${cheapBoot.name} lasts about ${Math.round(cheapBoot.lifespanMonths)} months (${usd(cheapBoot.perMonth, 2)}/mo). The ${goodBoot.name} lasts about ${Math.round(goodBoot.lifespanMonths)} (${usd(goodBoot.perMonth, 2)}/mo).`}
              />
            )}
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="scroll-mt-20">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div>
            <Reveal>
              <Eyebrow>How it works</Eyebrow>
              <h2 className="mt-3 font-display text-4xl font-bold leading-[1.02] tracking-tight sm:text-5xl">
                From job site to shopping list in 2 minutes.
              </h2>
            </Reveal>
            <ol className="mt-8 space-y-6">
              {[
                ["Tell us about the job", "Trade, hazards, climate, hours on your feet and what your site requires."],
                ["We match every hazard to a standard", "Each hazard turns into hard rules: an EH sole, a Class E hat, cut level A4 gloves."],
                ["Buy once, replace on time", "See the cost per month of every option, swap picks, share the kit and get reminders when gear wears out."],
              ].map(([title, body], i) => (
                <Reveal as="li" key={title} index={i} className="flex gap-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink font-display text-lg font-bold text-paper">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <p className="mt-1 text-ink-2">{body}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
          <Reveal className="rounded-3xl border border-line bg-card p-5 shadow-[0_24px_50px_-36px_rgb(0_0_0/0.4)] sm:p-7">
            <p className="text-sm font-semibold text-ink-2">What the matching engine does with your answers</p>
            <ul className="mt-4 divide-y divide-line">
              {showcase.map((h) => (
                <li key={h.id} className="grid grid-cols-1 gap-2 py-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-5">
                  <p className="flex items-start gap-2 font-semibold">
                    <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-accent-ink" />
                    {h.label}
                  </p>
                  <ul className="flex flex-wrap gap-1.5 sm:justify-end">
                    {h.effects.map((e) => (
                      <li key={e} className="rounded-md bg-ok-soft px-2 py-1 text-xs font-semibold text-ok">
                        {e}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-3">
              {facts.hazards} hazards and {facts.trades} trades mapped to ASTM F2413, ANSI Z87.1, Z89.1, ISEA 105, 107, 138 and NFPA 70E.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---------- Trades ---------- */}
      <section className="border-y border-line bg-sunken/60">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Start with your trade</Eyebrow>
              <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Pick your trade, skip a step.</h2>
            </div>
            <Link href="/catalog" className="flex items-center gap-1 text-sm font-semibold text-ink-2 hover:text-ink">
              Browse the catalog <Icon name="arrowRight" className="size-4" />
            </Link>
          </Reveal>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {trades.map((t, i) => (
              <Reveal key={t.id} index={i % 4} className="flex">
                <Link
                  href={`/build?trade=${t.id}`}
                  className="lift group flex w-full flex-col rounded-2xl border border-line bg-card p-4 hover:border-accent"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink transition group-hover:bg-accent group-hover:text-[#15171a]">
                    <Icon name={tradeIcon(t.id)} className="size-5" />
                  </span>
                  <span className="mt-3 font-semibold leading-snug">{t.label}</span>
                  <span className="mt-1 hidden text-sm text-ink-3 sm:block">{t.blurb}</span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Compare + Pro ---------- */}
      <section>
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
          <Reveal className="flex flex-col rounded-3xl border border-line bg-card p-6 sm:p-8">
            <span className="flex size-11 items-center justify-center rounded-xl bg-sunken">
              <Icon name="scale" className="size-6" />
            </span>
            <h3 className="mt-5 font-display text-3xl font-bold tracking-tight">Cheapest today or cheapest to own?</h3>
            <p className="mt-2 text-ink-2">
              Put the lowest-price, best-value and top-quality versions of your kit side by side: price today, cost per month and how
              often you&apos;ll rebuy.
            </p>
            <div className="mt-auto pt-6">
              <ButtonLink href={compareHref([example.token])} variant="outline" iconRight="arrowRight">
                Compare an electrician kit
              </ButtonLink>
            </div>
          </Reveal>
          <Reveal index={1} className="relative flex flex-col overflow-hidden rounded-3xl bg-steel p-6 text-steel-ink sm:p-8">
            <div className="hazard absolute inset-x-0 top-0 h-1.5" aria-hidden />
            <span className="flex items-center gap-2 text-sm font-semibold text-steel-muted">
              <Icon name="crown" className="size-5 text-accent" /> GearFit Pro
            </span>
            <h3 className="mt-4 font-display text-3xl font-bold tracking-tight">Know when to replace. Never pay full price.</h3>
            <ul className="mt-4 space-y-2 text-steel-muted">
              {["Wear tracker for every item in your kits", "Deal alerts when your exact gear drops in price", "Unlimited saved kits for every season and site"].map(
                (t) => (
                  <li key={t} className="flex gap-2">
                    <Icon name="check" className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2.6} />
                    {t}
                  </li>
                ),
              )}
            </ul>
            <div className="mt-auto flex flex-wrap items-center gap-4 pt-6">
              <ButtonLink href="/pro" iconRight="arrowRight">
                See Pro, $4/month
              </ButtonLink>
              <span className="text-sm text-steel-muted">Cancel anytime</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="scroll-mt-20 border-t border-line bg-card">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <Reveal>
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Straight answers.</h2>
          </Reveal>
          <Reveal index={1} className="divide-y divide-line border-y border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-lg font-semibold transition-colors hover:text-accent-ink [&::-webkit-details-marker]:hidden">
                  {q}
                  <Icon name="plus" className="size-5 shrink-0 text-ink-3 transition duration-300 group-open:rotate-45" />
                </summary>
                <p className="pb-5 pr-8 leading-relaxed text-ink-2">{a}</p>
              </details>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="px-4 py-16 sm:px-6 sm:py-20">
        <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-accent px-6 py-12 text-center text-[#15171a] shadow-[0_30px_60px_-34px_rgb(255_106_19/0.9)] sm:px-12 sm:py-16">
          <div className="hazard-moving absolute inset-x-0 bottom-0 h-2.5 opacity-90" aria-hidden />
          <h2 className="mx-auto max-w-3xl font-display text-4xl font-extrabold leading-[0.98] tracking-tight sm:text-6xl">
            Your next pair of boots should be the right pair.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg opacity-80">Five questions. A kit that fits your trade, your site and your budget.</p>
          <ButtonLink href="/build" size="lg" variant="dark" iconRight="arrowRight" className="mt-8">
            Build my kit
          </ButtonLink>
        </Reveal>
      </section>
    </main>
  );
}

const FAQ: [string, string][] = [
  [
    "Is GearFit free?",
    "Yes. Building, sharing and comparing kits is free, and so are replacement reminders. GearFit Pro ($4/month) adds a wear tracker, deal alerts and unlimited saved kits.",
  ],
  [
    "How does GearFit make money?",
    "When you buy through our retailer links we may earn a small commission, at no extra cost to you. It never changes the pick: products are filtered by the standards you need, then ranked by price, lifespan and quality.",
  ],
  [
    "Does this replace my employer's safety rules?",
    "No. GearFit is a buying guide. Always follow your site's PPE program, and check the product page for the exact rating before you buy.",
  ],
  [
    "Where do prices and lifespans come from?",
    "Prices are approximate US street prices. Lifespans are GearFit estimates for 40 hours of wear a week, scaled to the hours you tell us.",
  ],
  [
    "Do I need an account?",
    "No. Your kit lives in its link. Save it on this device, share it with your crew, or leave an email for replacement reminders.",
  ],
];

function PainCard({ index, icon, stat, title, body }: { index: number; icon: IconName; stat: ReactNode; title: string; body: string }) {
  return (
    <Reveal index={index} className="lift flex flex-col rounded-3xl border border-line bg-paper p-6">
      <span className="flex size-10 items-center justify-center rounded-xl bg-card text-accent-ink shadow-sm">
        <Icon name={icon} className="size-5" />
      </span>
      <p className="mt-5 font-display text-4xl font-extrabold tracking-tight">{stat}</p>
      <p className="mt-2 font-semibold leading-snug">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{body}</p>
    </Reveal>
  );
}

function HeroKit({ kit, href }: { kit: KitView; href: string }) {
  const standards = kit.standards.slice(0, 3).join(" · ");
  return (
    <Link
      href={href}
      className="animate-rise group relative block rounded-[30px] bg-steel p-1.5 text-steel-ink shadow-2xl shadow-black/25 transition duration-300 [--delay:200ms] [--rise-y:26px] hover:-translate-y-1.5 hover:shadow-[0_40px_70px_-30px_rgb(0_0_0/0.55)]"
      aria-label={`Open the example ${kit.tradeLabel.toLowerCase()} kit`}
    >
      <span
        className="animate-pop absolute -right-1.5 -top-3.5 z-10 flex rotate-3 items-center gap-1.5 rounded-full bg-ok px-3 py-1.5 text-xs font-bold text-white shadow-lg [--delay:1500ms] sm:-right-3 dark:text-[#0e1012]"
        aria-hidden
      >
        <Icon name="shield" className="size-3.5" strokeWidth={2.4} />
        Passes the site check
      </span>
      <div className="hazard h-2 rounded-t-[24px]" aria-hidden />
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-steel-muted">Example kit</p>
            <p className="mt-1 font-display text-2xl font-bold leading-none sm:text-3xl">
              {kit.tradeLabel} · {kit.answers.hoursPerWeek} h/week
            </p>
          </div>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold">{kit.items.length} items</span>
        </div>
        <ul className="mt-4 divide-y divide-white/10">
          {kit.items.map((item, i) => (
            <li
              key={item.label}
              className="animate-rise flex items-center gap-3 py-2.5"
              style={cssVars({ "--i": i, "--stagger": "110ms", "--delay": "450ms", "--rise-y": "10px" })}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.07]" aria-hidden>
                <Icon name={categoryIcon(item.category)} className="size-5" strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-steel-muted">{item.label}</p>
                <p className="truncate text-sm font-semibold">
                  {item.pick.product.brand} {item.pick.product.name}
                </p>
              </div>
              <div className="text-right">
                <p className="tabular text-sm font-bold">{usd(item.pick.product.price)}</p>
                {item.mustHave[0] && <p className="text-[11px] text-accent">{item.mustHave[0]}</p>}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl bg-white/[0.07] p-3.5">
            <p className="text-xs text-steel-muted">Pay today</p>
            <p className="font-display text-3xl font-bold">
              <AnimatedNumber value={kit.totals.upfront} delay={500} duration={1100} />
            </p>
          </div>
          <div className="rounded-2xl bg-accent p-3.5 text-[#15171a]">
            <p className="text-xs font-medium opacity-75">Real cost of wear</p>
            <p className="font-display text-3xl font-bold">
              <AnimatedNumber value={kit.totals.perMonth} digits={2} delay={500} duration={1100} />
              <span className="text-base font-semibold">/mo</span>
            </p>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-steel-muted">
          <Icon name="shield" className="size-4 shrink-0 text-accent" />
          <span className="truncate">Meets {standards}</span>
          <Icon name="arrowRight" className="ml-auto size-4 shrink-0 transition group-hover:translate-x-0.5" />
        </p>
      </div>
    </Link>
  );
}
