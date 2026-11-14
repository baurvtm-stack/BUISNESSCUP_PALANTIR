"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, categoryIcon, tradeIcon } from "@/components/icons";
import ReminderForm from "@/components/ReminderForm";
import { Button, ButtonLink, Eyebrow } from "@/components/ui";
import { cssVars } from "@/lib/css";
import { monthYear, shortDate, usd } from "@/lib/format";
import { ensureCloudSlug, shareUrl } from "@/lib/kit-actions";
import { loadKitPriceDrops } from "@/lib/kit-price-drops";
import { compareHref, kitHref, shortKitHref } from "@/lib/kit-url";
import { useHydrated } from "@/lib/local-store";
import { formatSaving } from "@/lib/price-drops";
import { FREE_KIT_LIMIT, proAccessStore, proStore, removeKit, savedKits, updateKit, type SavedKit } from "@/lib/saved-kits";
import { wearLabel, wearOf, type Wear } from "@/lib/wear";

const STATUS_STYLE = {
  good: { text: "text-ok", bar: "bg-ok" },
  soon: { text: "text-warn", bar: "bg-warn" },
  due: { text: "text-danger", bar: "bg-danger" },
} as const;

export default function MyKits() {
  const hydrated = useHydrated();
  const kits = savedKits.useValue();
  const pro = proStore.useValue();
  const accessToken = proAccessStore.useValue();
  const [selected, setSelected] = useState<string[]>([]);
  const [priceDrops, setPriceDrops] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    setPriceDrops({});
    void loadKitPriceDrops(kits, !!pro, accessToken).then((drops) => {
      if (active) setPriceDrops(drops);
    });
    return () => { active = false; };
  }, [kits, pro, accessToken]);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 sm:px-6" aria-busy>
        <div className="skeleton h-12 w-48 rounded-xl" />
        <div className="skeleton h-64 rounded-3xl" />
      </div>
    );
  }

  const chosen = kits.filter((k) => selected.includes(k.id));
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 3 ? prev : [...prev, id]));

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Saved on this device</Eyebrow>
          <h1 className="mt-2 font-display text-5xl font-extrabold tracking-tight">My kits</h1>
        </div>
        <ButtonLink href="/build" icon="plus" variant="outline">
          New kit
        </ButtonLink>
      </header>

      <PlanMeter count={kits.length} proEmail={pro?.email} />

      {kits.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-line-2 bg-card px-6 py-14 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
            <Icon name="bookmark" className="size-7" />
          </span>
          <h2 className="mt-5 font-display text-3xl font-bold">No saved kits yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-ink-2">
            Build a kit and tap Save. It stays on this device, no account needed, and you&apos;ll see when each piece is due for
            replacement.
          </p>
          <ButtonLink href="/build" className="mt-6" iconRight="arrowRight">
            Build my first kit
          </ButtonLink>
        </div>
      ) : (
        <ul className="mt-8 space-y-5">
          {kits.map((kit, i) => (
            <li key={kit.id} className="animate-rise" style={cssVars({ "--i": Math.min(i, 5), "--stagger": "70ms", "--rise-y": "16px" })}>
              <KitCard kit={kit} pro={!!pro} savingCents={pro && accessToken && kit.slug ? priceDrops[kit.slug] : undefined} selected={selected.includes(kit.id)} onToggleCompare={() => toggle(kit.id)} />
            </li>
          ))}
        </ul>
      )}

      {chosen.length > 0 && (
        <div className="animate-rise fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 shadow-[0_-10px_30px_-18px_rgb(0_0_0/0.35)] backdrop-blur-md">
          <div className="pb-safe mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 pt-3 sm:px-6">
            <p className="text-sm font-medium">
              {chosen.length === 1 ? "Pick one more kit to compare" : `${chosen.length} kits selected`}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                Clear
              </Button>
              {chosen.length >= 2 && (
                <ButtonLink href={compareHref(chosen.map((k) => ({ token: k.token, choices: k.choices })))} size="sm" iconRight="arrowRight">
                  Compare
                </ButtonLink>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanMeter({ count, proEmail }: { count: number; proEmail?: string }) {
  if (proEmail) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-steel px-4 py-3 text-sm text-steel-ink">
        <span className="flex items-center gap-1.5 font-semibold">
          <Icon name="crown" className="size-4 text-accent" /> Pro
        </span>
        <span className="text-steel-muted">Unlimited kits · wear tracker · deal alerts to {proEmail}</span>
      </div>
    );
  }
  const used = Math.min(count, FREE_KIT_LIMIT);
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: FREE_KIT_LIMIT }, (_, i) => (
            <span key={i} className={`h-2 w-6 rounded-full transition-colors duration-500 ${i < used ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>
        <p className="text-sm text-ink-2">
          {used} of {FREE_KIT_LIMIT} free saves used
        </p>
      </div>
      <Link href="/pro" className="text-sm font-semibold text-accent-ink hover:underline">
        Unlimited with Pro
      </Link>
    </div>
  );
}

function KitCard({
  kit,
  pro,
  savingCents,
  selected,
  onToggleCompare,
}: {
  kit: SavedKit;
  pro: boolean;
  savingCents?: number;
  selected: boolean;
  onToggleCompare: () => void;
}) {
  const [panel, setPanel] = useState<"none" | "reminders" | "delete">("none");
  const [copied, setCopied] = useState(false);
  const href = kitHref(kit.token, { choices: kit.choices, slug: kit.slug });
  const rows = kit.items
    .map((item, index) => ({ item, index, wear: wearOf(item.lifespanMonths, new Date(item.replacedAt ?? kit.boughtAt)) }))
    .sort((a, b) => a.wear.remainingMonths - b.wear.remainingMonths);
  const next = rows[0];

  async function share() {
    const slug = kit.slug ?? (await ensureCloudSlug(kit));
    const url = window.location.origin + (slug ? shortKitHref(slug) : href);
    const result = await shareUrl(url, `My ${kit.tradeLabel} kit on GearFit`);
    if (result === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function markReplaced(index: number) {
    const today = new Date().toISOString().slice(0, 10);
    updateKit(kit.id, (k) => ({ items: k.items.map((it, i) => (i === index ? { ...it, replacedAt: today } : it)) }));
  }

  return (
    <article className={`rounded-3xl border bg-card transition ${selected ? "border-accent ring-2 ring-accent/30" : "border-line"}`}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink" aria-hidden>
            <Icon name={tradeIcon(kit.tradeId)} className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-3xl font-bold leading-none">{kit.tradeLabel}</h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-3">
              <span>Saved {shortDate(kit.createdAt)}</span>
              <span className="inline-flex items-center gap-1">
                <Icon name={kit.slug ? "checkCircle" : "info"} className="size-3.5" />
                {kit.slug ? "Backed up" : "On this device"}
              </span>
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-2 hover:bg-sunken">
            <input type="checkbox" checked={selected} onChange={onToggleCompare} className="size-4 accent-[var(--accent)]" />
            Compare
          </label>
        </div>

        {savingCents !== undefined && savingCents > 0 && (
          <p className="animate-rise mt-3 inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1 text-xs font-semibold text-ok" role="status">
            <Icon name="tag" className="size-3.5" /> Price drop {formatSaving(savingCents)}
          </p>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2 text-center sm:text-left">
          <Figure label="Paid" value={usd(kit.totals.upfront)} />
          <Figure label="Per month" value={usd(kit.totals.perMonth, 2)} accent />
          <Figure label="Items" value={String(kit.items.length)} />
        </div>

        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Items">
          {kit.items.map((it) => (
            <li
              key={`${it.label}-${it.productId}`}
              title={`${it.brand} ${it.name}`}
              className="flex size-9 items-center justify-center rounded-lg bg-sunken text-ink-2"
            >
              <Icon name={categoryIcon(it.category)} className="size-[18px]" />
              <span className="sr-only">
                {it.label}: {it.brand} {it.name}
              </span>
            </li>
          ))}
        </ul>

        {pro ? (
          <WearTracker kit={kit} rows={rows} onReplaced={markReplaced} />
        ) : (
          next && <LockedTracker next={next} rows={rows} />
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <ButtonLink href={href} variant="dark" size="sm" iconRight="arrowRight">
            Open kit
          </ButtonLink>
          <Button variant="outline" size="sm" icon={copied ? "check" : "share"} onClick={share}>
            {copied ? "Copied" : "Share"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon="bell"
            onClick={() => setPanel((p) => (p === "reminders" ? "none" : "reminders"))}
            aria-expanded={panel === "reminders"}
          >
            {kit.reminderEmail ? "Reminders on" : "Email reminders"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="trash"
            className="ml-auto text-ink-3"
            onClick={() => setPanel((p) => (p === "delete" ? "none" : "delete"))}
          >
            Delete
          </Button>
        </div>

        {panel === "delete" && (
          <div className="animate-rise mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-danger-soft px-4 py-3">
            <p className="text-sm font-medium text-danger">Delete this kit from this device?</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPanel("none")}>
                Keep it
              </Button>
              <Button size="sm" variant="dark" onClick={() => removeKit(kit.id)}>
                Delete
              </Button>
            </div>
          </div>
        )}
        {panel === "reminders" && (
          <div className="animate-rise mt-4 rounded-2xl border border-line bg-paper p-4">
            <ReminderForm
              tone="plain"
              getSlug={() => ensureCloudSlug(kit)}
              items={kit.items}
              activeEmail={kit.reminderEmail}
              onSubscribed={(email) => updateKit(kit.id, { reminderEmail: email })}
            />
          </div>
        )}
      </div>
    </article>
  );
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-sunken px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`tabular mt-0.5 font-display text-xl font-bold sm:text-2xl ${accent ? "text-accent-ink" : ""}`}>{value}</p>
    </div>
  );
}

type Row = { item: SavedKit["items"][number]; index: number; wear: Wear };

function WearBar({ wear }: { wear: Wear }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-sunken">
      <div
        className={`animate-grow-x h-full rounded-full transition-[width] duration-700 ${STATUS_STYLE[wear.status].bar}`}
        style={{ width: `${Math.max(4, wear.pct * 100)}%` }}
      />
    </div>
  );
}

function WearTracker({ kit, rows, onReplaced }: { kit: SavedKit; rows: Row[]; onReplaced: (index: number) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className="mt-5 rounded-2xl border border-line p-4" aria-label="Wear tracker">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold">
          <Icon name="clock" className="size-4 text-accent-ink" /> Wear tracker
        </p>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          Bought on
          <input
            type="date"
            value={kit.boughtAt}
            max={today}
            onChange={(e) => e.target.value && updateKit(kit.id, { boughtAt: e.target.value })}
            className="h-9 rounded-lg border border-line-2 bg-card px-2 text-sm"
          />
        </label>
      </div>
      <ul className="mt-4 space-y-4">
        {rows.map(({ item, index, wear }) => (
          <li key={`${item.productId}-${index}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold">{item.label}</span>
              <span className={`shrink-0 font-semibold ${STATUS_STYLE[wear.status].text}`}>{wearLabel(wear)}</span>
            </div>
            <div className="mt-1.5">
              <WearBar wear={wear} />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-ink-3">
              <span className="truncate">
                {item.brand} {item.name} · due {monthYear(wear.dueDate)}
              </span>
              <button type="button" onClick={() => onReplaced(index)} className="shrink-0 font-semibold text-ink-2 hover:text-ink">
                I replaced it
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LockedTracker({ next, rows }: { next: Row; rows: Row[] }) {
  return (
    <section className="mt-5 rounded-2xl bg-sunken p-4" aria-label="Next replacement">
      <p className="text-sm">
        <span className="text-ink-3">Next up:</span> <span className="font-semibold">{next.item.label}</span>{" "}
        <span className={`font-semibold ${STATUS_STYLE[next.wear.status].text}`}>· {wearLabel(next.wear).toLowerCase()}</span>
      </p>
      <div className="relative mt-3">
        <div aria-hidden className="pointer-events-none select-none space-y-3 opacity-60 blur-[3px]">
          {rows.slice(0, 3).map(({ item, index, wear }) => (
            <div key={`${item.productId}-${index}`}>
              <div className="flex justify-between text-xs">
                <span>{item.label}</span>
                <span>{wearLabel(wear)}</span>
              </div>
              <div className="mt-1">
                <WearBar wear={wear} />
              </div>
            </div>
          ))}
        </div>
        <Link
          href="/pro"
          className="absolute inset-0 m-auto flex h-10 w-fit items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-paper shadow-lg transition hover:scale-[1.03] active:scale-[0.98]"
        >
          <Icon name="lock" className="size-4" /> Track wear on every item with Pro
        </Link>
      </div>
    </section>
  );
}
