"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatedNumber } from "@/components/fx";
import GearArt from "@/components/GearArt";
import { Icon, categoryIcon } from "@/components/icons";
import { AnimatePresence, EASE, m, MotionRoot } from "@/components/motion";
import ReminderForm from "@/components/ReminderForm";
import SavingsCounter from "@/components/SavingsCounter";
import DealAlerts from "@/components/DealAlerts";
import { Button, ButtonLink, Chip, Eyebrow, Notice, StandardBadge } from "@/components/ui";
import { cssVars } from "@/lib/css";
import type { KitItemSnapshot } from "@/lib/api/contract";
import { duration, usd } from "@/lib/format";
import { ensureCloudSlug, saveCloudKit, saveKit, shareUrl, type KitDraft } from "@/lib/kit-actions";
import { compareHref, goHref, kitHref, shortKitHref } from "@/lib/kit-url";
import { FREE_KIT_LIMIT, findSavedKit, proStore, savedKits, updateKit } from "@/lib/saved-kits";
import { coveredStandards } from "@/lib/standards";
import type { KitView as Kit, ViewItem, ViewPick } from "@/lib/server/kit-view";

const CLIMATE = { hot: "Hot climate", mild: "Mild climate", cold: "Cold climate", wet: "Rainy climate" } as const;
const PRIORITY = { value: "Lowest price first", balanced: "Best value", premium: "Best quality" } as const;


/** Picks the option with this product id, or GearFit's pick. */
function optionFor(item: ViewItem, productId: string): ViewPick {
  return (productId && item.alternatives.find((a) => a.pick.product.id === productId)?.pick) || item.pick;
}

/** Keeps only valid swaps; "" means GearFit's own pick. */
function normalize(items: ViewItem[], raw: string[]): string[] {
  return items.map((item, i) => {
    const id = raw[i] ?? "";
    return id && id !== item.pick.product.id && item.alternatives.some((a) => a.pick.product.id === id) ? id : "";
  });
}

export default function KitView({ kit, initialChoices, sharedSlug }: { kit: Kit; initialChoices: string[]; sharedSlug?: string }) {
  const [choices, setChoices] = useState<string[]>(() => normalize(kit.items, initialChoices));
  const kits = savedKits.useValue();
  const pro = proStore.useValue();
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const chosen = useMemo(() => kit.items.map((item, i) => optionFor(item, choices[i])), [kit.items, choices]);
  const standards = useMemo(() => coveredStandards(chosen.map((pick) => pick.product)), [chosen]);
  const saved = findSavedKit(kits, kit.token, choices);
  const untouched = choices.join(",") === normalize(kit.items, initialChoices).join(",");
  // A short link's slug identifies this exact kit; after a swap it no longer does.
  const slug = saved?.slug ?? (untouched ? sharedSlug : undefined);

  const snapshot: KitItemSnapshot[] = useMemo(
    () =>
      kit.items.map((item, i) => ({
        category: item.category,
        label: item.label,
        productId: chosen[i].product.id,
        brand: chosen[i].product.brand,
        name: chosen[i].product.name,
        price: chosen[i].product.price,
        lifespanMonths: chosen[i].lifespanMonths,
        costPerMonth: chosen[i].costPerMonth,
      })),
    [kit.items, chosen],
  );
  const totals = useMemo(() => {
    const upfront = snapshot.reduce((s, p) => s + p.price, 0);
    const perMonth = Math.round(snapshot.reduce((s, p) => s + p.costPerMonth, 0) * 100) / 100;
    return { upfront, perMonth, perYear: perMonth * 12 };
  }, [snapshot]);
  const next = useMemo(() => [...snapshot].sort((a, b) => a.lifespanMonths - b.lifespanMonths)[0], [snapshot]);
  const savingsPerYear = kit.totals.cheapestPerYear - totals.perYear;
  const extraToday = totals.upfront - kit.totals.cheapestUpfront;

  // Keep the address bar equal to what's on screen, so copying the URL shares this exact kit.
  useEffect(() => {
    const href = kitHref(kit.token, { choices, slug: untouched ? sharedSlug : undefined });
    if (href !== window.location.pathname + window.location.search) window.history.replaceState(null, "", href);
  }, [kit.token, choices, untouched, sharedSlug]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const flash = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // A swap made further down the page moves the savings counter out of sight, so say the new number.
  const savingsRef = useRef<HTMLDivElement>(null);
  const savingsLabel = savingsPerYear > 1 ? usd(savingsPerYear) : "";
  const savingsSeen = useRef(savingsLabel);
  useEffect(() => {
    if (savingsSeen.current === savingsLabel) return;
    savingsSeen.current = savingsLabel;
    const box = savingsRef.current?.getBoundingClientRect();
    const middle = box ? (box.top + box.bottom) / 2 : -1;
    if (savingsLabel && (middle < 72 || middle > window.innerHeight - 72)) flash(`You now save ${savingsLabel} a year`);
  }, [savingsLabel, flash]);

  const draft: KitDraft = {
    token: kit.token,
    choices,
    tradeId: kit.answers.trade,
    tradeLabel: kit.tradeLabel,
    items: snapshot,
    totals: { upfront: totals.upfront, perMonth: totals.perMonth },
  };

  async function onSave() {
    if (saved || saving) return;
    if (!pro && kits.length >= FREE_KIT_LIMIT) {
      setLimitHit(true);
      return;
    }
    setSaving(true);
    const result = await saveKit(draft);
    setSaving(false);
    setJustSaved(true);
    flash(result.slug ? "Saved to My kits" : "Saved to My kits on this device");
  }

  async function onShare() {
    const url = window.location.origin + (slug ? shortKitHref(slug) : kitHref(kit.token, { choices }));
    const result = await shareUrl(url, `My ${kit.tradeLabel} kit on GearFit`);
    if (result === "copied") flash("Link copied. Paste it anywhere.");
  }

  async function getSlug(): Promise<string | null> {
    if (saved) return ensureCloudSlug(saved);
    if (!pro && kits.length >= FREE_KIT_LIMIT) return saveCloudKit(draft);
    const result = await saveKit(draft);
    return result.slug ?? null;
  }

  function onSubscribed(email: string) {
    const current = findSavedKit(savedKits.get(), kit.token, choices);
    if (current) updateKit(current.id, { reminderEmail: email });
  }

  const a = kit.answers;
  const chips = [
    `${a.hoursPerWeek} h/week`,
    CLIMATE[a.climate],
    a.gender === "women" ? "Women's sizing" : a.gender === "men" ? "Men's sizing" : null,
    a.shoeSize ? `Shoe ${a.shoeSize}` : null,
    a.clothingSize ? `Clothing ${a.clothingSize.replace(/(\d+)x(\d+)/i, "$1×$2")}` : null,
    PRIORITY[a.budget],
    a.maxBudget ? `Max ${usd(a.maxBudget)}` : null,
  ].filter((c): c is string => !!c);

  const saveLabel = saved ? "Saved" : saving ? "Saving…" : "Save kit";

  return (
    <MotionRoot>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* ---------- Header ---------- */}
        <header className="animate-rise">
          <Eyebrow>Your kit</Eyebrow>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">{kit.tradeLabel}</h1>
            <div className="hidden flex-wrap gap-2 sm:flex print:hidden">
              <Button
                onClick={onSave}
                icon={saved ? "bookmarkCheck" : "bookmark"}
                variant={saved ? "outline" : "primary"}
                disabled={saving}
                className={justSaved && saved ? "animate-bump" : ""}
              >
                {saveLabel}
              </Button>
              <Button onClick={onShare} variant="outline" icon="share">
                Share
              </Button>
              <ButtonLink href={compareHref([kit.token])} variant="outline" icon="scale">
                Compare tiers
              </ButtonLink>
              <Button onClick={() => window.print()} variant="ghost" icon="printer" aria-label="Print shopping list" className="px-3">
                <span className="sr-only">Print</span>
              </Button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
            <Link
              href={`/build?k=${kit.token}`}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-accent-ink hover:underline print:hidden"
            >
              <Icon name="pencil" className="size-3.5" /> Edit answers
            </Link>
          </div>
        </header>

        {/* ---------- Summary ---------- */}
        <section aria-label="Kit summary" className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-12">
          <div
            className="animate-rise relative col-span-2 flex flex-col overflow-hidden rounded-3xl bg-accent p-5 text-[#15171a] shadow-[0_18px_40px_-22px_rgb(255_106_19/0.9)] sm:p-6 lg:col-span-5 lg:row-span-2 print:shadow-none"
            style={cssVars({ "--delay": "60ms", "--rise-y": "14px" })}
          >
            <span className="sheen print:hidden" aria-hidden />
            <p className="text-xs font-semibold uppercase tracking-[0.1em] opacity-70">Real cost of wear</p>
            <p className="mt-2 font-display text-6xl font-extrabold leading-none tracking-tight sm:text-7xl lg:text-[84px]">
              <AnimatedNumber value={totals.perMonth} digits={2} duration={1100} delay={120} />
              <span className="text-2xl font-bold tracking-normal">/mo</span>
            </p>
            <p className="mt-2 text-sm opacity-75">
              <AnimatedNumber value={totals.perYear} countOnMount={false} /> a year, spread over how long each piece lasts
            </p>
            <ul className="mt-auto flex flex-wrap gap-1.5 pt-5 print:hidden" aria-label="Jump to an item">
              {kit.items.map((item, i) => (
                <li key={`${item.label}-${i}`} className="animate-pop" style={cssVars({ "--i": i, "--stagger": "70ms", "--delay": "350ms" })}>
                  <a
                    href={`#item-${i}`}
                    title={item.label}
                    className="flex size-10 items-center justify-center rounded-xl bg-[#15171a]/10 transition hover:bg-[#15171a] hover:text-accent"
                  >
                    <Icon name={categoryIcon(item.category)} className="size-5" strokeWidth={1.8} />
                    <span className="sr-only">{item.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <SavingsCounter
            ref={savingsRef}
            perYear={totals.perYear}
            cheapestPerYear={kit.totals.cheapestPerYear}
            cheapestUpfront={kit.totals.cheapestUpfront}
            extraToday={extraToday}
          />
          <Stat
            label="Pay today"
            value={<AnimatedNumber value={totals.upfront} duration={900} delay={200} />}
            sub={`${kit.items.length} items`}
            className="lg:col-span-3"
            delay={200}
          />
          <Stat
            label="First to replace"
            value={next?.label.replace(/\s*\(.*\)$/, "") ?? "None"}
            sub={next ? `${next.label.match(/\((.*)\)$/)?.[1].concat(", ") ?? ""}in about ${duration(next.lifespanMonths)}` : ""}
            className="lg:col-span-4"
            delay={260}
          />
        </section>

        <div className="mt-4 flex gap-2 sm:hidden print:hidden">
          <ButtonLink href={compareHref([kit.token])} variant="outline" size="sm" icon="scale" className="flex-1">
            Compare tiers
          </ButtonLink>
          <ButtonLink href={`/build?k=${kit.token}`} variant="outline" size="sm" icon="pencil" className="flex-1">
            Edit answers
          </ButtonLink>
        </div>

        {limitHit && (
          <Notice tone="warn" className="animate-rise mt-5">
            You&apos;ve saved {FREE_KIT_LIMIT} kits, the free limit.{" "}
            <Link href="/pro" className="font-semibold underline">
              Go Pro for unlimited kits
            </Link>{" "}
            or remove one in{" "}
            <Link href="/kits" className="font-semibold underline">
              My kits
            </Link>
            .
          </Notice>
        )}

        {kit.sizeNote && (
          <Notice tone="info" className="animate-rise mt-5 [--delay:300ms]">
            {kit.sizeNote}
          </Notice>
        )}

        {kit.warnings.length > 0 && (
          <Notice tone="warn" className="animate-rise mt-5 [--delay:300ms]">
            <p className="font-semibold">Before you buy</p>
            <ul className={`mt-1 space-y-1.5 ${kit.warnings.length > 1 ? "list-disc pl-4" : ""}`}>
              {kit.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Notice>
        )}

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* ---------- Items ---------- */}
          <section aria-label="Kit items" className="space-y-4">
            {kit.items.map((item, i) => (
              <ItemCard
                key={`${item.label}-${i}`}
                index={i}
                item={item}
                pick={chosen[i]}
                choice={choices[i]}
                kitRef={slug ?? kit.token}
                onChoose={(id) => setChoices((prev) => prev.map((c, k) => (k === i ? (id === item.pick.product.id ? "" : id) : c)))}
              />
            ))}
            <p className="px-1 text-xs leading-relaxed text-ink-3 print:hidden">
              Illustrations show the type of gear, not the exact product. Pros and cons compare the options shown for each item, using
              only our catalog data: price, estimated wear life, rated levels and features.
            </p>
          </section>

          {/* ---------- Sidebar ---------- */}
          <aside className="animate-rise space-y-4 lg:sticky lg:top-24 lg:self-start print:hidden" style={cssVars({ "--delay": "320ms" })}>
            <div id="replacement-reminders" tabIndex={-1} className="scroll-mt-24 rounded-3xl focus-visible:outline-accent">
              <ReminderForm getSlug={getSlug} items={snapshot} activeEmail={saved?.reminderEmail} onSubscribed={onSubscribed} />
            </div>
            <DealAlerts key={slug ?? "unsaved"} kitSlug={slug} isPro={!!pro} />

            {standards.length > 0 && (
              <div className="rounded-3xl border border-line bg-card p-5 sm:p-6">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-ok-soft text-ok">
                    <Icon name="shield" className="size-5" />
                  </span>
                  <h2 className="font-display text-2xl font-bold leading-none">Standards covered</h2>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {standards.map((s) => (
                    <StandardBadge key={s}>{s}</StandardBadge>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-relaxed text-ink-3">
                  Prices are approximate and change often. Lifespans are GearFit estimates at {a.hoursPerWeek} h/week. Confirm the
                  exact rating on the product page and follow your site&apos;s safety rules. GearFit may earn a commission from
                  retailer links.
                </p>
              </div>
            )}

            {!pro && (
              <Link href="/pro" className="lift group relative block overflow-hidden rounded-3xl bg-steel p-5 text-steel-ink sm:p-6">
                <div className="hazard absolute inset-x-0 top-0 h-1.5" aria-hidden />
                <p className="flex items-center gap-2 text-sm font-semibold text-steel-muted">
                  <Icon name="crown" className="size-4 text-accent" /> GearFit Pro · $4/month
                </p>
                <p className="mt-2 font-display text-2xl font-bold leading-tight">Track wear on this kit and get deal alerts on every item.</p>
                <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                  See what&apos;s included <Icon name="arrowRight" className="size-4 transition group-hover:translate-x-0.5" />
                </p>
              </Link>
            )}
          </aside>
        </div>

        {/* ---------- Phone action bar ---------- */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur-md sm:hidden print:hidden">
          <div className="pb-safe flex items-center gap-2 px-4 pt-3">
            <div className="min-w-0 flex-1">
              <p className="font-display text-2xl font-bold leading-none">
                <AnimatedNumber value={totals.upfront} countOnMount={false} />
              </p>
              <p className="mt-0.5 text-xs text-ink-2">
                <span className="font-semibold text-accent-ink">
                  <AnimatedNumber value={totals.perMonth} digits={2} countOnMount={false} />
                  /mo
                </span>{" "}
                of wear
              </p>
            </div>
            <Button onClick={onShare} variant="outline" size="lg" className="w-12 px-0" aria-label="Share kit">
              <Icon name="share" className="size-5" />
            </Button>
            {saved ? (
              <ButtonLink href="/kits" variant="outline" size="lg" icon="bookmarkCheck" className={justSaved ? "animate-bump" : ""}>
                Saved
              </ButtonLink>
            ) : (
              <Button onClick={onSave} size="lg" icon="bookmark" disabled={saving}>
                {saveLabel}
              </Button>
            )}
          </div>
        </div>

        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 sm:bottom-8">
          <AnimatePresence>
            {toast && (
              <m.span
                key={toast}
                initial={{ opacity: 0, y: 18, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 460, damping: 30 }}
                className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper shadow-lg"
              >
                <Icon name="checkCircle" className="size-4 text-accent" />
                {toast}
              </m.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </MotionRoot>
  );
}

function Stat({
  label,
  value,
  sub,
  className = "",
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  sub: string;
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={`animate-rise flex flex-col rounded-3xl border border-line bg-card p-4 sm:p-5 ${className}`}
      style={cssVars({ "--delay": `${delay}ms`, "--rise-y": "14px" })}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">{label}</p>
      <p className="tabular mt-1.5 font-display text-3xl font-bold leading-none sm:text-4xl">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-ink-3 sm:text-sm">{sub}</p>}
    </div>
  );
}

function ItemCard({
  index,
  item,
  pick,
  choice,
  kitRef,
  onChoose,
}: {
  index: number;
  item: ViewItem;
  pick: ViewPick;
  choice: string;
  /** Saved-kit slug, or the answers token: lets the click log tie back to this kit. */
  kitRef?: string;
  onChoose: (productId: string) => void;
}) {
  const p = pick.product;
  const options = [{ label: "GearFit pick", pick: item.pick }, ...item.alternatives];
  const activeId = choice || item.pick.product.id;
  // Counts swaps, so the highlight ring replays on each one but never on the first render.
  const [swaps, setSwaps] = useState(0);

  function choose(productId: string) {
    if (productId === activeId) return;
    setSwaps((n) => n + 1);
    onChoose(productId);
  }

  return (
    <article
      id={`item-${index}`}
      className="animate-rise relative scroll-mt-24 rounded-3xl border border-line bg-card p-4 sm:p-6 print:break-inside-avoid print:rounded-none print:border-x-0 print:border-t-0"
      style={cssVars({ "--i": index, "--stagger": "80ms", "--delay": "240ms", "--rise-y": "22px" })}
    >
      {swaps > 0 && (
        <span key={swaps} className="animate-ring-out pointer-events-none absolute inset-0 rounded-3xl ring-2 ring-accent" aria-hidden />
      )}
      <div className="flex gap-3.5 sm:gap-5">
        <div className="relative shrink-0 self-start">
          <AnimatePresence mode="popLayout" initial={false}>
            <m.div
              key={p.id}
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <GearArt product={p} className="size-[76px] sm:size-28 sm:rounded-3xl" />
            </m.div>
          </AnimatePresence>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">{item.label}</p>
            <span
              className={`rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wide ${
                item.required ? "bg-accent-soft text-accent-ink" : "bg-sunken text-ink-3"
              }`}
            >
              {item.required ? "Required" : "Everyday"}
            </span>
          </div>
          <AnimatePresence mode="popLayout" initial={false}>
            <m.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              <h3 className="mt-1 text-lg font-semibold leading-snug sm:text-xl">
                {p.brand} {p.name}
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.standards.map((s) => (
                  <StandardBadge key={s}>{s}</StandardBadge>
                ))}
                {p.gender !== "unisex" && <Chip className="py-0.5">{p.gender === "men" ? "Men's" : "Women's"}</Chip>}
                {p.pack && <Chip className="py-0.5">{p.pack}</Chip>}
              </div>
            </m.div>
          </AnimatePresence>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-2xl bg-sunken py-3 text-center">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Price</dt>
          <dd className="mt-0.5 font-display text-2xl font-bold">
            <AnimatedNumber value={p.price} countOnMount={false} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Lasts</dt>
          <dd className="tabular mt-0.5 font-display text-2xl font-bold">
            ~<AnimatedNumber value={Math.round(pick.lifespanMonths)} kind="int" countOnMount={false} />
            <span className="text-sm font-semibold"> mo</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Per month</dt>
          <dd className="mt-0.5 font-display text-2xl font-bold text-accent-ink">
            <AnimatedNumber value={pick.costPerMonth} digits={2} countOnMount={false} />
          </dd>
        </div>
      </dl>

      <ProsCons pick={pick} compared={options.length} />

      {item.mustHave.length > 0 && (
        <p className="mt-4 flex gap-2 text-sm">
          <Icon name="shield" className="mt-0.5 size-4 shrink-0 text-ok" />
          <span>
            <span className="font-semibold">Must have:</span> <span className="text-ink-2">{item.mustHave.join(", ")}</span>
          </span>
        </p>
      )}
      {pick.missing.length > 0 && (
        <Notice tone="warn" className="mt-3">
          Doesn&apos;t cover: {pick.missing.join(", ")}. Check with your safety lead.
        </Notice>
      )}

      {pick.reasons.length > 0 && (
        <details className="group mt-3">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
            Why it fits your job
            <Icon name="chevronDown" className="size-4 transition group-open:rotate-180" />
          </summary>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
            {pick.reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <Icon name="check" className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2.6} />
                <span>{r}</span>
              </li>
            ))}
          </ul>
          {p.note && (
            <p className="mt-2 flex gap-2 text-sm text-ink-2">
              <Icon name="info" className="mt-0.5 size-4 shrink-0 text-ink-3" />
              {p.note}
            </p>
          )}
        </details>
      )}

      <div className="mt-4 border-t border-line pt-4 print:hidden">
        {options.length > 1 && (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">Compare {options.length} options</p>
              <p className="text-xs text-ink-3">All meet your requirements</p>
            </div>
            <div
              role="radiogroup"
              aria-label={`${item.label} options`}
              className={`no-scrollbar -mx-4 mt-2.5 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:snap-none sm:overflow-visible sm:px-0 sm:pb-0 ${
                options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
              }`}
            >
              {options.map((o) => (
                <OptionCard key={o.pick.product.id} label={o.label} pick={o.pick} active={o.pick.product.id === activeId} onChoose={choose} />
              ))}
            </div>
          </>
        )}
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-3">
            Chosen from {item.optionsConsidered} compliant option{item.optionsConsidered === 1 ? "" : "s"}
          </p>
          <a
            href={goHref(p.id, kitRef)}
            target="_blank"
            rel="noopener sponsored"
            className="group/buy inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition hover:opacity-90 active:scale-[0.98]"
          >
            Check price
            <Icon name="external" className="size-4 transition-transform group-hover/buy:-translate-y-0.5 group-hover/buy:translate-x-0.5" />
          </a>
        </div>
      </div>
    </article>
  );
}

/** A plus or minus bullet. The sign is drawn, so the line reads without relying on color. */
function Sign({ kind }: { kind: "pro" | "con" }) {
  return (
    <span
      className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ${
        kind === "pro" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"
      }`}
      aria-hidden
    >
      <Icon name={kind === "pro" ? "plus" : "minus"} className="size-3" strokeWidth={3} />
    </span>
  );
}

/**
 * Pros and cons of the selected product. Every line comes from catalog data and compares
 * it with the other options shown for this item (see lib/pros-cons).
 */
function ProsCons({ pick, compared }: { pick: ViewPick; compared: number }) {
  if (!pick.pros.length && !pick.cons.length) return null;
  return (
    <div className="relative mt-4 print:hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div
          key={pick.product.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={{ duration: 0.28, ease: EASE }}
          className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2"
        >
          {compared > 1 && (
            <p className="text-xs text-ink-3 sm:col-span-2">
              Against the other {compared - 1 === 1 ? "option" : `${compared - 1} options`} below
            </p>
          )}
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ok">Pros</h4>
            <ul className="mt-1.5 space-y-1.5 text-sm text-ink-2">
              {pick.pros.map((line) => (
                <li key={line} className="flex gap-2">
                  <Sign kind="pro" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-warn">Cons</h4>
            {pick.cons.length > 0 ? (
              <ul className="mt-1.5 space-y-1.5 text-sm text-ink-2">
                {pick.cons.map((line) => (
                  <li key={line} className="flex gap-2">
                    <Sign kind="con" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-sm text-ink-3">
                {compared > 1 ? "Nothing stands out against the other options shown." : "Nothing to compare it with: no other product qualifies."}
              </p>
            )}
          </div>
        </m.div>
      </AnimatePresence>
    </div>
  );
}

/** One option for an item: what it is, what it costs, and its strongest pro and con. */
function OptionCard({
  label,
  pick,
  active,
  onChoose,
}: {
  label: string;
  pick: ViewPick;
  active: boolean;
  onChoose: (productId: string) => void;
}) {
  const p = pick.product;
  const ours = label === "GearFit pick";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={`${label}: ${p.brand} ${p.name}, ${usd(p.price)}, ${usd(pick.costPerMonth, 2)} per month`}
      onClick={() => onChoose(p.id)}
      className={`relative flex w-[78%] shrink-0 snap-start flex-col rounded-2xl border p-3 text-left transition active:scale-[0.98] sm:w-auto ${
        active ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-line bg-card hover:border-line-2 hover:bg-sunken/50"
      }`}
    >
      <span className="flex items-start gap-2.5">
        <GearArt product={p} className={`size-12 rounded-xl ${active ? "bg-card" : ""}`} />
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide ${ours ? "text-accent-ink" : "text-ink-3"}`}>
            {ours && <Icon name="sparkle" className="size-3" />}
            {label}
          </span>
          <span className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug">
            {p.brand} {p.name}
          </span>
        </span>
        <span
          className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition ${
            active ? "border-accent bg-accent text-[#15171a]" : "border-line-2 text-transparent"
          }`}
          aria-hidden
        >
          <Icon name="check" className="size-3" strokeWidth={3.2} />
        </span>
      </span>
      <span className="tabular mt-2.5 flex flex-wrap items-baseline gap-x-2 text-xs text-ink-3">
        <span className="text-sm font-bold text-ink">{usd(p.price)}</span>
        <span>~{Math.round(pick.lifespanMonths) || duration(pick.lifespanMonths).replace(" months", "")} mo</span>
        <span className="ml-auto text-sm font-bold text-accent-ink">{usd(pick.costPerMonth, 2)}/mo</span>
      </span>
      {(pick.pros[0] || pick.cons[0]) && (
        <span className="mt-2.5 block space-y-1 border-t border-line pt-2.5 text-xs leading-snug text-ink-2">
          {pick.pros[0] && (
            <span className="flex gap-1.5">
              <Sign kind="pro" />
              <span className="line-clamp-2">{pick.pros[0]}</span>
            </span>
          )}
          {pick.cons[0] && (
            <span className="flex gap-1.5">
              <Sign kind="con" />
              <span className="line-clamp-2">{pick.cons[0]}</span>
            </span>
          )}
        </span>
      )}
    </button>
  );
}
