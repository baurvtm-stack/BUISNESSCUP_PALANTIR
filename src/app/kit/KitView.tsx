"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, categoryIcon } from "@/components/icons";
import ReminderForm from "@/components/ReminderForm";
import DealAlerts from "@/components/DealAlerts";
import { Button, ButtonLink, Chip, Eyebrow, IconTile, Notice, StandardBadge } from "@/components/ui";
import type { KitItemSnapshot } from "@/lib/api/contract";
import { duration, usd } from "@/lib/format";
import { ensureCloudSlug, saveKit, shareUrl, type KitDraft } from "@/lib/kit-actions";
import { compareHref, goHref, kitHref, shortKitHref } from "@/lib/kit-url";
import { FREE_KIT_LIMIT, findSavedKit, proStore, savedKits, updateKit } from "@/lib/saved-kits";
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
  const [limitHit, setLimitHit] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const chosen = useMemo(() => kit.items.map((item, i) => optionFor(item, choices[i])), [kit.items, choices]);
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

  function flash(message: string) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

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
    flash(result.slug ? "Saved to My kits" : "Saved to My kits on this device");
  }

  async function onShare() {
    const url = window.location.origin + (slug ? shortKitHref(slug) : kitHref(kit.token, { choices }));
    const result = await shareUrl(url, `My ${kit.tradeLabel} kit on GearFit`);
    if (result === "copied") flash("Link copied. Paste it anywhere.");
  }

  async function getSlug(): Promise<string | null> {
    if (saved) return ensureCloudSlug(saved);
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
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      {/* ---------- Header ---------- */}
      <header className="animate-rise">
        <Eyebrow>Your kit</Eyebrow>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">{kit.tradeLabel}</h1>
          <div className="hidden flex-wrap gap-2 sm:flex print:hidden">
            <Button onClick={onSave} icon={saved ? "bookmarkCheck" : "bookmark"} variant={saved ? "outline" : "primary"} disabled={saving}>
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
      <section aria-label="Kit summary" className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pay today" value={usd(totals.upfront)} sub={`${kit.items.length} items`} />
        <Stat label="Real cost of wear" value={`${usd(totals.perMonth, 2)}`} unit="/mo" sub={`${usd(totals.perYear)} a year`} highlight />
        <Stat
          label="First to replace"
          value={next?.label.replace(/\s*\(.*\)$/, "") ?? "None"}
          sub={next ? `${next.label.match(/\((.*)\)$/)?.[1].concat(", ") ?? ""}in about ${duration(next.lifespanMonths)}` : ""}
          small
        />
        {savingsPerYear > 1 ? (
          <Stat
            label="vs. cheapest compliant kit"
            value={`Save ${usd(savingsPerYear)}`}
            unit="/yr"
            sub={extraToday > 0 ? `Pay ${usd(extraToday)} more today, rebuy less often` : "And cheaper today too"}
            small
          />
        ) : (
          <Stat label="Cheapest compliant kit" value={usd(kit.totals.cheapestUpfront)} sub="Lowest price that meets every rule" small />
        )}
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
        <Notice tone="warn" className="mt-5">
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
        <Notice tone="info" className="mt-5">
          {kit.sizeNote}
        </Notice>
      )}

      {kit.warnings.length > 0 && (
        <Notice tone="warn" className="mt-5">
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
              item={item}
              pick={chosen[i]}
              choice={choices[i]}
              kitRef={slug ?? kit.token}
              onChoose={(id) => setChoices((prev) => prev.map((c, k) => (k === i ? (id === item.pick.product.id ? "" : id) : c)))}
            />
          ))}
        </section>

        {/* ---------- Sidebar ---------- */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start print:hidden">
          <div id="replacement-reminders" tabIndex={-1} className="scroll-mt-24 rounded-3xl focus-visible:outline-accent">
            <ReminderForm getSlug={getSlug} items={snapshot} activeEmail={saved?.reminderEmail} onSubscribed={onSubscribed} />
          </div>
          <DealAlerts key={slug ?? "unsaved"} kitSlug={slug} isPro={!!pro} />

          {kit.standards.length > 0 && (
            <div className="rounded-3xl border border-line bg-card p-5 sm:p-6">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-ok-soft text-ok">
                  <Icon name="shield" className="size-5" />
                </span>
                <h2 className="font-display text-2xl font-bold leading-none">Standards covered</h2>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {kit.standards.map((s) => (
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
            <Link href="/pro" className="group relative block overflow-hidden rounded-3xl bg-steel p-5 text-steel-ink sm:p-6">
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
            <p className="tabular font-display text-2xl font-bold leading-none">{usd(totals.upfront)}</p>
            <p className="mt-0.5 text-xs text-ink-2">
              <span className="font-semibold text-accent-ink">{usd(totals.perMonth, 2)}/mo</span> of wear
            </p>
          </div>
          <Button onClick={onShare} variant="outline" size="lg" className="w-12 px-0" aria-label="Share kit">
            <Icon name="share" className="size-5" />
          </Button>
          {saved ? (
            <ButtonLink href="/kits" variant="outline" size="lg" icon="bookmarkCheck">
              Saved
            </ButtonLink>
          ) : (
            <Button onClick={onSave} size="lg" icon="bookmark" disabled={saving}>
              {saveLabel}
            </Button>
          )}
        </div>
      </div>

      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 transition sm:bottom-8 ${
          toast ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        {toast && (
          <span className="flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper shadow-lg">
            <Icon name="checkCircle" className="size-4 text-accent" />
            {toast}
          </span>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  sub,
  highlight,
  small,
}: {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  highlight?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-3xl p-4 sm:p-5 ${
        highlight ? "bg-accent text-[#15171a]" : "border border-line bg-card"
      }`}
    >
      <p className={`text-xs font-semibold uppercase tracking-[0.1em] ${highlight ? "opacity-70" : "text-ink-3"}`}>{label}</p>
      <p className={`tabular mt-1.5 font-display font-bold leading-none ${small ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"}`}>
        {value}
        {unit && <span className="text-base font-semibold">{unit}</span>}
      </p>
      {sub && <p className={`mt-1.5 text-xs sm:text-sm ${highlight ? "opacity-75" : "text-ink-3"}`}>{sub}</p>}
    </div>
  );
}

function ItemCard({
  item,
  pick,
  choice,
  kitRef,
  onChoose,
}: {
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

  return (
    <article className="rounded-3xl border border-line bg-card p-4 sm:p-6 print:break-inside-avoid print:rounded-none print:border-x-0 print:border-t-0">
      <div className="flex gap-3.5 sm:gap-4">
        <IconTile name={categoryIcon(item.category)} className="sm:size-12" />
        <div className="min-w-0 flex-1">
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
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-2xl bg-sunken py-3 text-center">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Price</dt>
          <dd className="tabular mt-0.5 font-display text-2xl font-bold">{usd(p.price)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Lasts</dt>
          <dd className="tabular mt-0.5 font-display text-2xl font-bold">
            ~{Math.round(pick.lifespanMonths)}
            <span className="text-sm font-semibold"> mo</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Per month</dt>
          <dd className="tabular mt-0.5 font-display text-2xl font-bold text-accent-ink">{usd(pick.costPerMonth, 2)}</dd>
        </div>
      </dl>

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
            Why this pick
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
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">Also meets your requirements</p>
            <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label={`${item.label} options`}>
              {options.map((o) => {
                const active = o.pick.product.id === activeId;
                return (
                  <button
                    key={o.pick.product.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChoose(o.pick.product.id)}
                    title={`${o.pick.product.brand} ${o.pick.product.name}`}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                      active ? "border-accent bg-accent-soft ring-1 ring-accent" : "border-line bg-card hover:border-line-2"
                    }`}
                  >
                    <span className="block text-xs font-bold">{o.label}</span>
                    <span className="tabular block text-xs text-ink-3">
                      {usd(o.pick.product.price)} · {usd(o.pick.costPerMonth, 2)}/mo
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-3">
            Chosen from {item.optionsConsidered} compliant option{item.optionsConsidered === 1 ? "" : "s"}
          </p>
          <a
            href={goHref(p.id, kitRef)}
            target="_blank"
            rel="noopener sponsored"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition hover:opacity-90"
          >
            Check price
            <Icon name="external" className="size-4" />
          </a>
        </div>
      </div>
    </article>
  );
}
