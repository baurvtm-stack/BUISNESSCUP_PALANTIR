"use client";

import { useState, type Ref } from "react";
import { AnimatedNumber } from "@/components/fx";
import { cssVars } from "@/lib/css";
import { usd } from "@/lib/format";

/**
 * The number the kit page leads with, on an odometer, for every kit whatever its sizing.
 *
 * When this kit costs less a year to wear than the cheapest kit that still passes, the card
 * shows that saving: the subtraction the page has always shown (the cheapest kit's yearly cost
 * of wear minus this kit's). When it saves $1 a year or less (often a "Lowest price today" kit,
 * which is the cheapest kit), the card shows what the old "Cheapest compliant kit" stat did:
 * the lowest price that passes today. No new figures, only the display.
 *
 * The wheels are drawn and moved by CSS alone (see "Savings odometer" in globals.css): the
 * server render already points each wheel at its digit, a keyframe spins it up on first
 * paint, a transition rolls it when a swap changes the kit, and reduced motion lands on the
 * number at once. Screen readers get the sentence instead of the wheels.
 */
export default function SavingsCounter({
  perYear,
  cheapestPerYear,
  cheapestUpfront,
  extraToday,
  ref,
}: {
  perYear: number;
  cheapestPerYear: number;
  cheapestUpfront: number;
  extraToday: number;
  ref?: Ref<HTMLDivElement>;
}) {
  const saves = cheapestPerYear - perYear > 1;
  // Formatted like every other dollar amount on the page, so the wheels can't disagree with it.
  const label = usd(saves ? cheapestPerYear - perYear : cheapestUpfront);
  const amount = Number(label.replace(/\D/g, ""));

  // Remember the last amount shown, to flag how far a swap moved the saving. Switching between
  // the saving and the lowest price just rolls the wheels: a flag only compares like with like.
  const [shown, setShown] = useState({ saves, amount });
  const [change, setChange] = useState<{ by: number; n: number } | null>(null);
  if (shown.saves !== saves || shown.amount !== amount) {
    setShown({ saves, amount });
    setChange(shown.saves === saves ? { by: amount - shown.amount, n: (change?.n ?? 0) + 1 } : null);
  }

  const extra = Math.round(extraToday);
  const caption = saves
    ? extra > 0
      ? `Pay ${usd(extra)} more today, rebuy less often`
      : extra < 0
        ? `And ${usd(-extra)} cheaper today too`
        : "Same price today, rebuy less often"
    : extra > 0
      ? `This kit costs ${usd(extra)} more today`
      : "This kit is the lowest price that passes";
  const sentence = saves
    ? `You save ${label} a year against the cheapest kit that passes.`
    : `The cheapest kit that passes costs ${label} today.`;

  // One wheel per digit, keyed by its place (0 = ones), so a wheel stays put when the amount gains a digit.
  let place = String(amount).length;
  const wheels = [...label.replace("$", "")].map((ch) => (/\d/.test(ch) ? { ch, place: --place, digit: Number(ch) } : { ch, place, digit: null }));

  // The dearer kit fills its bar. When this kit is the cheaper one to wear, the striped rest of its bar is the saving.
  const top = Math.max(cheapestPerYear, perYear, 1);
  const rows = [
    { label: "Cheapest kit that passes", value: cheapestPerYear, mine: false },
    { label: "This kit", value: perYear, mine: true },
  ].map((row) => ({ ...row, share: Math.max(4, Math.min(100, (row.value / top) * 100)) }));

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
            {sentence} {caption}.
          </p>
          <p className="flex h-5 items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-steel-muted print:text-black" aria-hidden>
            {saves ? "You save" : "Cheapest kit that passes"}
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
            <span className="pb-2 text-2xl font-bold tracking-tight sm:text-[28px]">{saves ? "a year" : "today"}</span>
          </p>
          <p className="mt-3 max-w-[22rem] text-xs text-steel-muted sm:text-sm print:text-black" aria-hidden>
            {caption}
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
                <dd className={`col-span-2 h-3 overflow-hidden rounded-full print:border print:border-black/30 ${row.mine && saves ? "odo-kept" : "bg-white/8"}`} aria-hidden>
                  <span
                    className={`animate-grow-x block h-full rounded-full transition-[width] duration-500 print:bg-black/40 ${row.mine ? "bg-accent" : "bg-white/30"}`}
                    style={{ width: `${row.share}%`, ...cssVars({ "--i": i, "--delay": "480ms" }) }}
                  />
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 flex items-center gap-2 text-xs text-steel-muted print:hidden" aria-hidden>
            {saves ? (
              <>
                <span className="odo-kept inline-block h-2.5 w-5 shrink-0 rounded-full" />
                The striped part stays in your pocket
              </>
            ) : (
              "Cost of wear a year"
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
