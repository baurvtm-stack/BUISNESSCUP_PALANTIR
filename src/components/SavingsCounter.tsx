"use client";

import { useState, type Ref } from "react";
import { AnimatedNumber } from "@/components/fx";
import { cssVars } from "@/lib/css";
import { usd } from "@/lib/format";

/**
 * The number the kit page leads with: what this kit saves a year against the cheapest kit
 * that still passes, on an odometer. The amount is the subtraction the page has always shown
 * (the cheapest kit's yearly cost of wear minus this kit's); only the display is new.
 *
 * The wheels are drawn and moved by CSS alone (see "Savings odometer" in globals.css): the
 * server render already points each wheel at its digit, a keyframe spins it up on first
 * paint, a transition rolls it when a swap changes the kit, and reduced motion lands on the
 * number at once. Screen readers get the sentence instead of the wheels.
 */
export default function SavingsCounter({
  perYear,
  cheapestPerYear,
  extraToday,
  ref,
}: {
  perYear: number;
  cheapestPerYear: number;
  extraToday: number;
  ref?: Ref<HTMLDivElement>;
}) {
  // Formatted like every other dollar amount on the page, so the wheels can't disagree with it.
  const label = usd(cheapestPerYear - perYear);
  const amount = Number(label.replace(/\D/g, ""));

  // Remember the last amount shown, to flag how far a swap moved it.
  const [shown, setShown] = useState(amount);
  const [change, setChange] = useState<{ by: number; n: number } | null>(null);
  if (shown !== amount) {
    setShown(amount);
    setChange({ by: amount - shown, n: (change?.n ?? 0) + 1 });
  }

  const extra = Math.round(extraToday);
  const today =
    extra > 0 ? `Pay ${usd(extra)} more today, rebuy less often` : extra < 0 ? `And ${usd(-extra)} cheaper today too` : "Same price today, rebuy less often";

  // One wheel per digit, keyed by its place (0 = ones), so a wheel stays put when the amount gains a digit.
  let place = String(amount).length;
  const wheels = [...label.replace("$", "")].map((ch) => (/\d/.test(ch) ? { ch, place: --place, digit: Number(ch) } : { ch, place, digit: null }));

  // The cheapest kit fills its bar; this kit stops short of it, and the striped rest is the saving.
  const rows = [
    { label: "Cheapest kit that passes", value: cheapestPerYear, share: 100, mine: false },
    { label: "This kit", value: perYear, share: Math.max(4, Math.min(100, (perYear / Math.max(cheapestPerYear, 1)) * 100)), mine: true },
  ];

  return (
    <div
      ref={ref}
      className="animate-rise relative col-span-2 overflow-hidden rounded-3xl bg-steel p-5 text-steel-ink shadow-[0_18px_40px_-24px_rgb(0_0_0/0.7)] ring-1 ring-inset ring-white/6 sm:p-6 lg:col-span-7 print:bg-transparent print:text-black print:shadow-none print:ring-black/20"
      style={cssVars({ "--delay": "140ms", "--rise-y": "14px" })}
    >
      <span
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_0%_100%,rgb(255_106_19/0.2),transparent_60%)] print:hidden"
        aria-hidden
      />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:gap-7">
        <div className="shrink-0">
          <p className="sr-only">
            You save {label} a year against the cheapest kit that passes. {today}.
          </p>
          <p className="flex h-5 items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-steel-muted print:text-black" aria-hidden>
            You save
            {change && (
              <span
                key={change.n}
                className={`odo-delta tabular rounded-full px-2 py-0.5 text-[11px] font-bold tracking-normal print:hidden ${
                  change.by > 0 ? "bg-[#4ade80]/15 text-[#4ade80]" : "bg-[#f87171]/15 text-[#f87171]"
                }`}
              >
                {change.by > 0 ? "+" : "−"}
                {usd(Math.abs(change.by))}
              </span>
            )}
          </p>
          <p className="mt-2 flex select-none items-end gap-2.5 font-display font-extrabold leading-none" aria-hidden>
            <span className="flex items-center gap-[0.1em] text-[68px] sm:text-[76px]">
              <span className="text-[0.62em] text-accent print:text-black">$</span>
              <span className="odo-window">
                {wheels.map((w) =>
                  w.digit === null ? (
                    <span key={`sep-${w.place}`} className="self-end text-[0.5em]">
                      {w.ch}
                    </span>
                  ) : (
                    <span key={`wheel-${w.place}`} className="odo-wheel">
                      <span className="odo-strip" style={cssVars({ "--digit": w.digit, "--place": w.place })} />
                    </span>
                  ),
                )}
                {/* The glass catches the light once the wheels land: after the first spin, and after each swap. */}
                <span key={amount} className="sheen print:hidden" style={cssVars({ "--delay": change ? "900ms" : "2000ms" })} />
              </span>
            </span>
            <span className="pb-2 text-2xl font-bold tracking-tight sm:text-[28px]">a year</span>
          </p>
          <p className="mt-3 text-xs text-steel-muted sm:text-sm print:text-black" aria-hidden>
            {today}
          </p>
        </div>

        <div className="min-w-0 flex-1 md:border-l md:border-white/10 md:pl-7 print:border-black/20">
          <dl className="space-y-3">
            {rows.map((row, i) => (
              <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5 text-xs sm:text-sm">
                <dt className={`truncate ${row.mine ? "font-semibold" : "text-steel-muted print:text-black"}`}>{row.label}</dt>
                <dd className={`tabular ${row.mine ? "font-bold" : "text-steel-muted print:text-black"}`}>
                  <AnimatedNumber value={row.value} countOnMount={false} />
                  /yr
                </dd>
                <dd className={`col-span-2 h-3 overflow-hidden rounded-full print:border print:border-black/30 ${row.mine ? "odo-kept" : "bg-white/8"}`} aria-hidden>
                  <span
                    className={`animate-grow-x block h-full rounded-full transition-[width] duration-500 print:bg-black/40 ${row.mine ? "bg-accent" : "bg-white/30"}`}
                    style={{ width: `${row.share}%`, ...cssVars({ "--i": i, "--delay": "480ms" }) }}
                  />
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 flex items-center gap-2 text-xs text-steel-muted print:hidden" aria-hidden>
            <span className="odo-kept inline-block h-2.5 w-5 shrink-0 rounded-full" />
            The striped part stays in your pocket
          </p>
        </div>
      </div>
    </div>
  );
}
