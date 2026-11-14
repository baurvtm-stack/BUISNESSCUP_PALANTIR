"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/fx";
import { Icon, categoryIcon, tradeIcon, type IconName } from "@/components/icons";
import { AnimatePresence, EASE, m, MotionRoot } from "@/components/motion";
import { Button } from "@/components/ui";
import { cssVars } from "@/lib/css";
import { encodeAnswers } from "@/lib/answers";
import { fetchRecommendation } from "@/lib/api/client";
import type { RecommendResponse } from "@/lib/api/contract";
import { kitHref } from "@/lib/kit-url";
import type { WizardData } from "@/lib/server/kit-view";
import type { Answers, BudgetTier, Climate, EmployerRule, Gender } from "@/lib/types";

const STEPS = ["Trade", "Hazards", "Conditions", "Site rules", "Fit & budget"] as const;
const DRAFT_KEY = "gearfit.draft.v1";

const DEFAULTS: Answers = {
  trade: "",
  extraHazards: [],
  climate: "mild",
  gender: "men",
  hoursPerWeek: 40,
  budget: "balanced",
  employer: [],
  shoeSize: "",
  clothingSize: "",
};

const CLIMATES: { id: Climate; label: string; hint: string; icon: IconName }[] = [
  { id: "hot", label: "Hot", hint: "TX, AZ, FL summers", icon: "sun" },
  { id: "mild", label: "Mild", hint: "Indoors or temperate", icon: "cloudSun" },
  { id: "cold", label: "Cold", hint: "Freezing winters", icon: "snowflake" },
  { id: "wet", label: "Rainy", hint: "PNW, Gulf Coast", icon: "rain" },
];

const BUDGETS: { id: BudgetTier; label: string; hint: string; icon: IconName }[] = [
  { id: "value", label: "Lowest price today", hint: "Spend as little as possible now", icon: "tag" },
  { id: "balanced", label: "Best value", hint: "Lowest cost per month of wear", icon: "scale" },
  { id: "premium", label: "Best quality", hint: "Top brands, longest life", icon: "star" },
];

const GENDERS: { id: Gender; label: string }[] = [
  { id: "men", label: "Men's" },
  { id: "women", label: "Women's" },
  { id: "unisex", label: "Show both" },
];

type Fit = { top: string; pants: string };

/** Clothing sizes travel as one answer, "L / 32x30"; the engine matches each garment to its part. */
function splitClothing(value?: string): Fit {
  const parts = (value ?? "").split("/").map((s) => s.trim()).filter(Boolean);
  const pants = parts.find((p) => /^\d+(x\d+)?$/i.test(p)) ?? "";
  return { top: parts.find((p) => p !== pants) ?? "", pants };
}

const joinClothing = ({ top, pants }: Fit) => (top && pants ? `${top} / ${pants}` : "");
const pantsLabel = (size: string) => (/x/i.test(size) ? size.replace(/x/i, " × ") : `Women's ${size}`);

interface Preview {
  key: string;
  data: RecommendResponse;
}

type PreviewKit = RecommendResponse["kit"];


/** Steps slide in from the side you're heading to; the old step fades out underneath, so nothing waits. */
const STEP_MOTION = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 32 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.32, ease: EASE } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -24, transition: { duration: 0.14 } }),
};

/** Staggers a card's CSS entrance by its position in the list (capped, so long lists stay quick). */
const cascade = (i: number) => cssVars({ "--i": Math.min(i, 9), "--stagger": "28ms" });

export default function Wizard({ data, initial, initialTrade }: { data: WizardData; initial?: Answers; initialTrade?: string }) {
  const router = useRouter();
  const [a, setA] = useState<Answers>(() => (initial ? { ...DEFAULTS, ...initial } : { ...DEFAULTS, trade: initialTrade ?? "" }));
  const [step, setStep] = useState(initial || initialTrade ? 1 : 0);
  const [dir, setDir] = useState(1);
  const [sheet, setSheet] = useState(false);
  const [fit, setFit] = useState<Fit>(() => splitClothing(initial?.clothingSize));
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);

  const trade = useMemo(() => data.trades.find((t) => t.id === a.trade), [data.trades, a.trade]);
  const answersKey = JSON.stringify(a);

  // Restore an unfinished questionnaire (e.g. after a refresh) unless the URL says what to load.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (initial || initialTrade) return;
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as { answers?: Answers; step?: number; fit?: Fit } | null;
      if (draft?.answers?.trade && data.trades.some((t) => t.id === draft.answers?.trade)) {
        setA({ ...DEFAULTS, ...draft.answers });
        setFit(draft.fit ?? splitClothing(draft.answers.clothingSize));
        setStep(Math.min(STEPS.length - 1, Math.max(0, draft.step ?? 1)));
      }
    } catch {
      /* ignore a corrupt draft */
    }
  }, [data.trades, initial, initialTrade]);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ answers: a, step, fit }));
    } catch {
      /* storage unavailable */
    }
  }, [a, step, fit]);

  // Live kit preview: re-run the real engine (debounced) whenever an answer changes.
  useEffect(() => {
    if (!a.trade) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      const out = await fetchRecommendation(a, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setPreviewLoading(false);
      if (out.kind === "ok") setPreview({ key: JSON.stringify(a), data: out.data });
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [a]);

  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((prev) => ({ ...prev, [k]: v }));
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function go(next: number) {
    setDir(next < step ? -1 : 1);
    setSheet(false);
    setStep(Math.min(STEPS.length - 1, Math.max(0, next)));
    // Keep the next question in view on phones.
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  function setFitSize(part: keyof Fit, value: string) {
    const next = { ...fit, [part]: value };
    setFit(next);
    set("clothingSize", joinClothing(next));
  }

  /** Switching sizing keeps only the sizes that exist for it. */
  function chooseGender(gender: Gender) {
    const keep = (list: string[], v?: string) => (v && list.includes(v) ? v : "");
    const next = { top: keep(data.sizes.tops[gender], fit.top), pants: keep(data.sizes.pants[gender], fit.pants) };
    setFit(next);
    setA((prev) => ({
      ...prev,
      gender,
      shoeSize: keep(data.sizes.shoes[gender], prev.shoeSize),
      clothingSize: joinClothing(next),
    }));
  }

  function chooseTrade(id: string) {
    setA((prev) => ({ ...prev, trade: id, extraHazards: prev.trade === id ? prev.extraHazards : [] }));
    go(1);
  }

  async function submit() {
    if (!a.trade || busy) return;
    setBusy(true);
    let token = preview?.key === answersKey ? preview.data.token : null;
    if (!token) {
      const out = await fetchRecommendation(a);
      // The kit page rebuilds the kit from the token, so the encoded answers are a safe fallback.
      token = out.kind === "ok" ? out.data.token : encodeAnswers(a);
    }
    // Start the kit page from its top; the questionnaire may be scrolled a little.
    window.scrollTo({ top: 0, behavior: "instant" });
    router.push(kitHref(token));
  }

  const last = step === STEPS.length - 1;
  const kit = preview?.data.kit;
  const stale = previewLoading || (preview !== null && preview.key !== answersKey);

  const nextButton = last ? (
    <Button onClick={submit} disabled={!a.trade || busy} size="lg" className="flex-1 sm:flex-none" iconRight={busy ? undefined : "arrowRight"}>
      {busy ? "Building your kit…" : "Build my kit"}
    </Button>
  ) : (
    <Button onClick={() => go(step + 1)} disabled={!a.trade} size="lg" variant="dark" className="flex-1 sm:flex-none" iconRight="arrowRight">
      {step === 3 && a.employer.length === 0 ? "Skip" : "Next"}
    </Button>
  );

  return (
    <MotionRoot>
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 overflow-x-clip px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div ref={topRef} className="relative scroll-mt-20">
          <Progress step={step} canJump={!!a.trade} onJump={go} />

          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <m.div key={step} custom={dir} variants={STEP_MOTION} initial="enter" animate="center" exit="exit" className="mt-8">
              {step === 0 && (
                <>
                  <StepHeader title="What's your trade?" sub="We start from the hazards OSHA and safety leads expect on your job." />
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {data.trades.map((t, i) => {
                      const active = a.trade === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => chooseTrade(t.id)}
                          aria-pressed={active}
                          style={cascade(i)}
                          className={`animate-rise group flex items-center gap-3.5 rounded-2xl border p-3.5 text-left transition active:scale-[0.985] ${
                            active
                              ? "border-accent bg-accent-soft ring-2 ring-accent/30"
                              : "border-line bg-card hover:border-accent hover:shadow-lg hover:shadow-black/5"
                          }`}
                        >
                          <span
                            className={`flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                              active ? "bg-accent text-[#15171a]" : "bg-sunken text-ink group-hover:bg-accent group-hover:text-[#15171a]"
                            }`}
                          >
                            <Icon name={tradeIcon(t.id)} className="size-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{t.label}</span>
                            <span className="block text-sm text-ink-3">{t.blurb}</span>
                          </span>
                          <Icon name="chevronRight" className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {step === 1 && trade && (
                <>
                  <StepHeader title={`Hazards on the job`} sub={`These come with being a ${trade.label.toLowerCase()}. Add anything else you run into.`} />
                  <div className="rounded-2xl border border-line bg-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-3">Already included for your trade</p>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {trade.hazards.map((id, i) => (
                        <li
                          key={id}
                          style={cssVars({ "--i": i, "--stagger": "50ms", "--delay": "120ms" })}
                          className="animate-pop inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1.5 text-sm font-medium text-ok"
                        >
                          <Icon name="check" className="size-3.5" strokeWidth={3} />
                          {data.hazards.find((h) => h.id === id)?.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="mb-3 mt-7 font-semibold">Do you also deal with…</p>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {data.hazards
                      .filter((h) => !trade.hazards.includes(h.id))
                      .sort((x, y) => Number(trade.optionalHazards.includes(y.id)) - Number(trade.optionalHazards.includes(x.id)))
                      .map((h, i) => (
                        <CheckCard
                          key={h.id}
                          index={i}
                          checked={a.extraHazards.includes(h.id)}
                          onChange={() => set("extraHazards", toggle(a.extraHazards, h.id))}
                          label={h.label}
                          detail={h.effects.length ? `Adds ${h.effects.join(" · ")}` : undefined}
                          badge={trade.optionalHazards.includes(h.id) ? "Common" : undefined}
                        />
                      ))}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <StepHeader title="Where and how much do you work?" sub="Climate changes the kit. Hours change how fast it wears out." />
                  <p className="mb-3 font-semibold">Climate</p>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {CLIMATES.map((c, i) => (
                      <ChoiceCard key={c.id} index={i} active={a.climate === c.id} onClick={() => set("climate", c.id)} title={c.label} hint={c.hint} icon={c.icon} />
                    ))}
                  </div>
                  <HoursField value={a.hoursPerWeek} onChange={(v) => set("hoursPerWeek", v)} />
                </>
              )}

              {step === 3 && (
                <>
                  <StepHeader
                    title="Does your site require anything?"
                    sub="Check your site rules or the job posting. Not sure? Skip it, you can change it later."
                  />
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {data.employerRules.map((r, i) => (
                      <CheckCard
                        key={r.id}
                        index={i}
                        checked={a.employer.includes(r.id)}
                        onChange={() => set("employer", toggle<EmployerRule>(a.employer, r.id))}
                        label={r.label}
                        detail={r.effects.join(" · ")}
                      />
                    ))}
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <StepHeader title="Fit and budget" sub="Sizes go on your kit so ordering takes a minute." />
                  <p className="mb-3 font-semibold">Sizing</p>
                  <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-sunken p-1" role="radiogroup" aria-label="Sizing">
                    {GENDERS.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        role="radio"
                        aria-checked={a.gender === g.id}
                        onClick={() => chooseGender(g.id)}
                        className={`h-11 rounded-xl text-sm font-semibold transition active:scale-[0.97] ${
                          a.gender === g.id ? "bg-card text-ink shadow-sm" : "text-ink-2 hover:text-ink"
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <SelectField
                      label="Boots (US)"
                      value={a.shoeSize ?? ""}
                      onChange={(v) => set("shoeSize", v)}
                      options={data.sizes.shoes[a.gender].map((s) => ({ value: s, label: s }))}
                    />
                    <SelectField
                      label="Shirt & jacket"
                      value={fit.top}
                      onChange={(v) => setFitSize("top", v)}
                      options={data.sizes.tops[a.gender].map((s) => ({ value: s, label: s }))}
                    />
                    <SelectField
                      label={a.gender === "men" ? "Pants (waist × inseam)" : "Pants"}
                      className="col-span-2 sm:col-span-1"
                      value={fit.pants}
                      onChange={(v) => setFitSize("pants", v)}
                      options={data.sizes.pants[a.gender].map((s) => ({ value: s, label: pantsLabel(s) }))}
                    />
                  </div>
                  <p className="mt-2.5 flex items-start gap-1.5 text-sm text-ink-3">
                    <Icon name="info" className="mt-0.5 size-4 shrink-0" />
                    {!fit.top !== !fit.pants
                      ? "Pick both clothing sizes and we'll only show shirts and pants that come in them."
                      : "Only sizes most of our gear comes in are listed. Not sure? Skip it and pick a size on the store page."}
                  </p>
                  <p className="mb-3 mt-8 font-semibold">What matters most?</p>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    {BUDGETS.map((b, i) => (
                      <ChoiceCard key={b.id} index={i} active={a.budget === b.id} onClick={() => set("budget", b.id)} title={b.label} hint={b.hint} icon={b.icon} />
                    ))}
                  </div>
                  <label className="mt-6 block max-w-xs">
                    <span className="text-sm font-semibold">Max for the whole kit (optional)</span>
                    <span className="mt-1.5 flex h-12 items-center rounded-xl border border-line-2 bg-card px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
                      <span className="text-ink-3">$</span>
                      <input
                        value={a.maxBudget ? String(a.maxBudget) : ""}
                        onChange={(e) => set("maxBudget", Number(e.target.value.replace(/[^0-9]/g, "").slice(0, 5)) || undefined)}
                        placeholder="No limit"
                        inputMode="numeric"
                        className="h-full w-full bg-transparent px-1.5 text-base outline-none placeholder:text-ink-3"
                      />
                    </span>
                  </label>
                </>
              )}
            </m.div>
          </AnimatePresence>

          <div className="mt-10 hidden items-center justify-between gap-3 sm:flex">
            <Button onClick={() => go(step - 1)} variant="ghost" icon="arrowLeft" className={step === 0 ? "invisible" : ""}>
              Back
            </Button>
            {nextButton}
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <PreviewPanel kit={kit} hasTrade={!!a.trade} stale={stale} />
          </div>
        </aside>

        {/* Phone action bar: the live kit folds out of the summary line. */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 shadow-[0_-10px_30px_-18px_rgb(0_0_0/0.35)] backdrop-blur-md sm:hidden">
          <div className="pb-safe px-4 pt-2.5">
            {a.trade && (
              <>
                <AnimatePresence initial={false}>
                  {sheet && kit && (
                    <m.div
                      id="kit-sheet"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <div className="max-h-[46dvh] overflow-y-auto pb-2 pt-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">Your kit so far</p>
                        <PreviewItems kit={kit} />
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>
                <button
                  type="button"
                  onClick={() => setSheet((open) => !open)}
                  disabled={!kit}
                  aria-expanded={sheet}
                  aria-controls="kit-sheet"
                  className={`mb-2 flex w-full items-center justify-between gap-3 rounded-lg text-xs transition-opacity ${stale ? "opacity-60" : ""}`}
                >
                  <span className="flex items-center gap-1.5 text-ink-2" aria-live="polite">
                    {kit ? (
                      <>
                        <span key={kit.items.length} className="animate-bump inline-block font-semibold text-ink">
                          {kit.items.length} items
                        </span>
                        ·
                        <span>
                          <AnimatedNumber value={kit.totals.upfront} countOnMount={false} /> today
                        </span>
                      </>
                    ) : (
                      "Building preview…"
                    )}
                  </span>
                  {kit && (
                    <span className="flex items-center gap-1 font-bold text-accent-ink">
                      <span>
                        <AnimatedNumber value={kit.totals.perMonth} digits={2} countOnMount={false} />
                        /mo
                      </span>
                      <Icon name="chevronDown" className={`size-4 transition-transform ${sheet ? "" : "rotate-180"}`} />
                      <span className="sr-only">{sheet ? "Hide kit" : "Show kit"}</span>
                    </span>
                  )}
                </button>
              </>
            )}
            <div className="flex gap-2">
              {step > 0 && (
                <Button onClick={() => go(step - 1)} variant="outline" size="lg" className="w-14 px-0" aria-label="Back">
                  <Icon name="arrowLeft" className="size-5" />
                </Button>
              )}
              {nextButton}
            </div>
          </div>
        </div>
      </div>
    </MotionRoot>
  );
}

function Progress({ step, canJump, onJump }: { step: number; canJump: boolean; onJump: (i: number) => void }) {
  return (
    <nav aria-label="Questionnaire progress">
      <p className="text-sm font-semibold text-ink-3">
        Step {step + 1} of {STEPS.length} · <span className="text-ink">{STEPS[step]}</span>
      </p>
      <ol className="mt-3 flex gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button
              type="button"
              disabled={i > 0 && !canJump}
              onClick={() => onJump(i)}
              aria-current={i === step ? "step" : undefined}
              aria-label={`${s}${i < step ? " (done)" : ""}`}
              className="group block w-full py-1.5 disabled:cursor-not-allowed"
            >
              <span className="relative block h-1.5 overflow-hidden rounded-full bg-line transition-colors group-enabled:group-hover:bg-line-2">
                <span
                  className={`absolute inset-0 origin-left rounded-full transition-[scale,background-color] duration-500 ease-out ${
                    i < step ? "scale-x-100 bg-ink" : i === step ? "scale-x-100 bg-accent" : "scale-x-0 bg-accent"
                  }`}
                />
              </span>
              <span className={`mt-1.5 hidden text-left text-xs transition-colors sm:block ${i === step ? "font-semibold text-ink" : "text-ink-3"}`}>
                {s}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function StepHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="mb-6">
      <h1 className="font-display text-[34px] font-bold leading-[1.02] tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-2 text-ink-2 sm:text-lg">{sub}</p>
    </header>
  );
}

function ChoiceCard({
  index = 0,
  active,
  onClick,
  title,
  hint,
  icon,
}: {
  index?: number;
  active: boolean;
  onClick: () => void;
  title: string;
  hint?: string;
  icon?: IconName;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={cascade(index)}
      className={`animate-rise relative flex flex-col items-start rounded-2xl border p-4 text-left transition active:scale-[0.98] ${
        active ? "border-accent bg-accent-soft ring-2 ring-accent/30" : "border-line bg-card hover:border-line-2 hover:shadow-md hover:shadow-black/5"
      }`}
    >
      {icon && <Icon name={icon} className={`mb-3 size-6 transition-colors ${active ? "text-accent-ink" : "text-ink-2"}`} />}
      <span className="font-semibold">{title}</span>
      {hint && <span className="mt-0.5 text-sm text-ink-3">{hint}</span>}
      {active && (
        <span className="animate-pop absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-accent text-[#15171a]">
          <Icon name="check" className="size-3" strokeWidth={3.2} />
        </span>
      )}
    </button>
  );
}

function CheckCard({
  index = 0,
  checked,
  onChange,
  label,
  detail,
  badge,
}: {
  index?: number;
  checked: boolean;
  onChange: () => void;
  label: string;
  detail?: string;
  badge?: string;
}) {
  return (
    <label
      style={cascade(index)}
      className={`animate-rise flex cursor-pointer gap-3 rounded-2xl border p-3.5 transition active:scale-[0.985] ${
        checked ? "border-accent bg-accent-soft" : "border-line bg-card hover:border-line-2 hover:shadow-md hover:shadow-black/5"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${
          checked ? "border-accent bg-accent text-[#15171a]" : "border-line-2 bg-card"
        }`}
        aria-hidden
      >
        {checked && <Icon name="check" className="animate-pop size-3.5" strokeWidth={3.2} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="font-medium leading-snug">{label}</span>
          {badge && (
            <span className="shrink-0 rounded-md bg-sunken px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">{badge}</span>
          )}
        </span>
        {detail && <span className="mt-1 block text-xs leading-relaxed text-ink-3">{detail}</span>}
      </span>
    </label>
  );
}

function HoursField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // Mirrors the engine: lifespans are rated at 40 h/week and scale with hours (clamped 0.5x–2x).
  const wear = Math.min(2, Math.max(0.5, value / 40));
  const note =
    value === 40
      ? "Lifespans are rated for a 40-hour week."
      : wear > 1
        ? `Your gear wears out about ${wear.toFixed(1)}× faster than on a 40-hour week. Every cost per month accounts for it.`
        : `Your gear lasts about ${(1 / wear).toFixed(1)}× longer than on a 40-hour week. Every cost per month accounts for it.`;
  return (
    <div className="mt-8 rounded-2xl border border-line bg-card p-5">
      <div className="flex items-end justify-between gap-4">
        <label htmlFor="hours" className="font-semibold">
          Hours on your feet per week
        </label>
        <p className="tabular font-display text-4xl font-bold leading-none">
          {value}
          <span className="ml-1 text-base font-semibold text-ink-3">h</span>
        </p>
      </div>
      <input
        id="hours"
        type="range"
        min={10}
        max={80}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={cssVars({ "--pct": `${((value - 10) / 70) * 100}%` })}
        className="range mt-3"
      />
      <div className="relative mt-1 flex justify-between text-xs text-ink-3">
        <span>10</span>
        {/* 40 sits 3/7 of the way along a 10-80 scale, not in the middle. */}
        <span className="absolute left-[42.86%] -translate-x-1/2">40</span>
        <span>80</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {[40, 50, 60].map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onChange(h)}
            aria-pressed={value === h}
            className={`h-9 rounded-full border px-3.5 text-sm font-medium transition active:scale-[0.96] ${
              value === h ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2 hover:border-ink-3"
            }`}
          >
            {h} h
          </button>
        ))}
      </div>
      <p className="mt-4 flex gap-2 text-sm text-ink-2">
        <Icon name="clock" className="mt-0.5 size-4 shrink-0 text-ink-3" />
        {note}
      </p>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  // Keep a value from an older link visible even if the catalog no longer lists it.
  const list = value && !options.some((o) => o.value === value) ? [{ value, label: value }, ...options] : options;
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-semibold">{label}</span>
      <span className="relative mt-1.5 block">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-full appearance-none rounded-xl border border-line-2 bg-card px-3 pr-9 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        >
          <option value="">Not sure</option>
          {list.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
      </span>
    </label>
  );
}

/** One line of the live kit. Flashes when its product changes, so you see what an answer did. */
function PreviewRow({ item, isNew }: { item: PreviewKit["items"][number]; isNew: boolean }) {
  const productId = item.pick.product.id;
  const last = useRef(productId);
  const [flash, setFlash] = useState(isNew ? 1 : 0);

  useEffect(() => {
    if (last.current === productId) return;
    last.current = productId;
    setFlash((n) => n + 1);
  }, [productId]);

  return (
    <div key={flash} className={`flex items-center gap-2.5 rounded-lg py-1.5 ${flash ? "animate-flash" : ""}`}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken" aria-hidden>
        <Icon name={categoryIcon(item.category)} className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-3">{item.label}</span>
        <span className="block truncate text-sm font-medium">
          {item.pick.product.brand} {item.pick.product.name}
        </span>
      </span>
      <span className="text-sm font-semibold">
        <AnimatedNumber value={item.pick.product.price} countOnMount={false} />
      </span>
    </div>
  );
}

/** The kit's items: the first batch cascades in, later answers add and remove rows in place. */
function PreviewItems({ kit }: { kit: PreviewKit }) {
  const settled = useRef(false);
  useEffect(() => {
    settled.current = true;
  }, []);

  return (
    <ul className="mt-2">
      <AnimatePresence>
        {kit.items.map((item, i) => (
          <m.li
            key={item.label}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: settled.current ? 0 : i * 0.05 }}
            className="overflow-hidden"
          >
            <PreviewRow item={item} isNew={settled.current} />
          </m.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function PreviewPanel({ kit, hasTrade, stale }: { kit?: PreviewKit; hasTrade: boolean; stale: boolean }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-card shadow-[0_20px_45px_-30px_rgb(0_0_0/0.35)]">
      <div className="hazard h-1.5" aria-hidden />
      <div className="h-0.5 overflow-hidden" aria-hidden>
        {stale && <div className="indeterminate h-full w-1/2 rounded-full bg-accent" />}
      </div>
      <div className="p-5 pt-4">
        <p className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
          Your kit so far
          {kit && (
            <span className="flex items-center gap-1.5 normal-case tracking-normal text-ok">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-ok" />
              </span>
              Live
            </span>
          )}
        </p>
        {!hasTrade ? (
          <p className="mt-3 text-sm text-ink-2">Pick your trade and your kit starts building here, live.</p>
        ) : !kit ? (
          <div className="mt-4 space-y-3" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-9 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className={`transition-opacity duration-300 ${stale ? "opacity-60" : ""}`} aria-live="polite">
            <p className="mt-1 font-display text-2xl font-bold">{kit.tradeLabel}</p>
            <PreviewItems kit={kit} />
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-4">
              <div>
                <p className="text-xs text-ink-3">Pay today</p>
                <p className="font-display text-2xl font-bold">
                  <AnimatedNumber value={kit.totals.upfront} duration={700} />
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-3">Cost of wear</p>
                <p className="font-display text-2xl font-bold text-accent-ink">
                  <AnimatedNumber value={kit.totals.perMonth} digits={2} duration={700} />
                  <span className="text-sm">/mo</span>
                </p>
              </div>
            </div>
            {kit.warnings.length > 0 && (
              <p className="mt-3 flex gap-1.5 text-xs text-warn">
                <Icon name="alert" className="size-3.5 shrink-0" />
                {kit.warnings.length} note{kit.warnings.length > 1 ? "s" : ""} on your kit page
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
