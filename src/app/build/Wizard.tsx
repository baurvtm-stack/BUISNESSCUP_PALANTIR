"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EMPLOYER_RULES, HAZARDS } from "@/data/hazards";
import { TRADES } from "@/data/trades";
import type { Answers, BudgetTier, Climate, EmployerRule, Gender } from "@/lib/types";

const STEPS = ["Your trade", "Hazards", "Conditions", "Employer rules", "Fit & budget"] as const;

const CLIMATES: { id: Climate; label: string; hint: string }[] = [
  { id: "hot", label: "Hot", hint: "TX, AZ, FL summers" },
  { id: "mild", label: "Mild", hint: "Mostly indoors or temperate" },
  { id: "cold", label: "Cold", hint: "Freezing winters" },
  { id: "wet", label: "Rainy", hint: "PNW, Gulf Coast" },
];

const BUDGETS: { id: BudgetTier; label: string; hint: string }[] = [
  { id: "value", label: "Lowest price today", hint: "Spend as little as possible now" },
  { id: "balanced", label: "Best value", hint: "Lowest cost per month of wear" },
  { id: "premium", label: "Best quality", hint: "Top brands, longest life" },
];

const GENDERS: { id: Gender; label: string }[] = [
  { id: "men", label: "Men's sizing" },
  { id: "women", label: "Women's sizing" },
  { id: "unisex", label: "Show both" },
];

export default function Wizard({ initialTrade }: { initialTrade?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(initialTrade ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [a, setA] = useState<Answers>({
    trade: initialTrade ?? "",
    extraHazards: [],
    climate: "mild",
    gender: "men",
    hoursPerWeek: 40,
    budget: "balanced",
    employer: [],
    shoeSize: "",
    clothingSize: "",
  });

  const trade = useMemo(() => TRADES.find((t) => t.id === a.trade), [a.trade]);
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((prev) => ({ ...prev, [k]: v }));
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const canNext = step !== 0 || Boolean(trade);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      router.push(`/kit?k=${data.token}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <ol className="mb-8 flex gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button
              type="button"
              disabled={i > step || (i > 0 && !trade)}
              onClick={() => setStep(i)}
              className={`h-1.5 w-full rounded-full transition ${i <= step ? "bg-amber-500" : "bg-zinc-200 dark:bg-zinc-800"}`}
              aria-label={s}
            />
            <span className={`mt-2 hidden text-xs sm:block ${i === step ? "font-semibold" : "text-zinc-500"}`}>{s}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Section title="What do you do?" sub="We start from the hazards OSHA and safety leads expect in your trade.">
          <div className="grid gap-3 sm:grid-cols-2">
            {TRADES.map((t) => (
              <Choice
                key={t.id}
                active={a.trade === t.id}
                onClick={() => {
                  setA((prev) => ({ ...prev, trade: t.id, extraHazards: [] }));
                  setStep(1);
                }}
                title={t.label}
                hint={t.blurb}
              />
            ))}
          </div>
        </Section>
      )}

      {step === 1 && trade && (
        <Section title={`Hazards for a ${trade.label.toLowerCase()}`} sub="Already included for your trade. Add anything else you run into.">
          <div className="mb-6 flex flex-wrap gap-2">
            {trade.hazards.map((id) => (
              <span key={id} className="rounded-full bg-amber-100 px-3 py-1.5 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                ✓ {HAZARDS.find((h) => h.id === id)?.label}
              </span>
            ))}
          </div>
          <p className="mb-3 text-sm font-medium">Do you also deal with…</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {HAZARDS.filter((h) => !trade.hazards.includes(h.id))
              .sort((x, y) => Number(trade.optionalHazards.includes(y.id)) - Number(trade.optionalHazards.includes(x.id)))
              .map((h) => (
                <Check
                  key={h.id}
                  checked={a.extraHazards.includes(h.id)}
                  onChange={() => set("extraHazards", toggle(a.extraHazards, h.id))}
                  label={h.label}
                  badge={trade.optionalHazards.includes(h.id) ? "common" : undefined}
                />
              ))}
          </div>
        </Section>
      )}

      {step === 2 && (
        <Section title="Where and how much do you work?" sub="Climate changes the kit; hours change how fast it wears out.">
          <div className="grid gap-3 sm:grid-cols-4">
            {CLIMATES.map((c) => (
              <Choice key={c.id} active={a.climate === c.id} onClick={() => set("climate", c.id)} title={c.label} hint={c.hint} />
            ))}
          </div>
          <label className="mt-8 block">
            <span className="text-sm font-medium">Hours on your feet per week: <b>{a.hoursPerWeek}</b></span>
            <input
              type="range"
              min={10}
              max={80}
              step={5}
              value={a.hoursPerWeek}
              onChange={(e) => set("hoursPerWeek", Number(e.target.value))}
              className="mt-3 w-full accent-amber-500"
            />
            <span className="flex justify-between text-xs text-zinc-500"><span>10</span><span>40</span><span>80</span></span>
          </label>
        </Section>
      )}

      {step === 3 && (
        <Section title="Does your employer require anything?" sub="Check your site rules or job posting. Skip if you're not sure.">
          <div className="grid gap-3 sm:grid-cols-2">
            {EMPLOYER_RULES.map((r) => (
              <Check
                key={r.id}
                checked={a.employer.includes(r.id)}
                onChange={() => set("employer", toggle<EmployerRule>(a.employer, r.id))}
                label={r.label}
              />
            ))}
          </div>
        </Section>
      )}

      {step === 4 && (
        <Section title="Fit and budget" sub="Sizes go on your kit so you can order fast.">
          <div className="grid gap-3 sm:grid-cols-3">
            {GENDERS.map((g) => (
              <Choice key={g.id} active={a.gender === g.id} onClick={() => set("gender", g.id)} title={g.label} />
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Shoe size (US)" value={a.shoeSize ?? ""} onChange={(v) => set("shoeSize", v)} placeholder="10.5" />
            <Field label="Clothing size" value={a.clothingSize ?? ""} onChange={(v) => set("clothingSize", v)} placeholder="L / 34x32" />
          </div>
          <p className="mb-3 mt-8 text-sm font-medium">What matters most?</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {BUDGETS.map((b) => (
              <Choice key={b.id} active={a.budget === b.id} onClick={() => set("budget", b.id)} title={b.label} hint={b.hint} />
            ))}
          </div>
          <div className="mt-4 max-w-xs">
            <Field
              label="Max for the whole kit, $ (optional)"
              value={a.maxBudget ? String(a.maxBudget) : ""}
              onChange={(v) => set("maxBudget", v ? Number(v.replace(/[^0-9]/g, "")) || undefined : undefined)}
              placeholder="400"
              inputMode="numeric"
            />
          </div>
        </Section>
      )}

      {error && <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

      <div className="mt-10 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className={`rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 ${step === 0 ? "invisible" : ""}`}
        >
          ← Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            disabled={!canNext}
            onClick={() => setStep((s) => s + 1)}
            className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
          >
            {step === 3 && a.employer.length === 0 ? "Skip" : "Next"} →
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-zinc-950 shadow-sm hover:bg-amber-400 disabled:opacity-60"
          >
            {busy ? "Building your kit…" : "Build my kit"}
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {sub && <p className="mb-6 mt-2 text-zinc-600 dark:text-zinc-400">{sub}</p>}
      {children}
    </section>
  );
}

function Choice({ active, onClick, title, hint }: { active: boolean; onClick: () => void; title: string; hint?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border p-4 text-left transition ${
        active
          ? "border-amber-500 bg-amber-50 ring-2 ring-amber-500/30 dark:bg-amber-500/10"
          : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
      }`}
    >
      <span className="block font-semibold">{title}</span>
      {hint && <span className="mt-0.5 block text-sm text-zinc-500">{hint}</span>}
    </button>
  );
}

function Check({ checked, onChange, label, badge }: { checked: boolean; onChange: () => void; label: string; badge?: string }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition ${
        checked ? "border-amber-500 bg-amber-50 dark:bg-amber-500/10" : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4 accent-amber-500" />
      <span className="flex-1 text-sm">{label}</span>
      {badge && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800">{badge}</span>}
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "numeric";
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={8}
        className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2.5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 dark:border-zinc-700"
      />
    </label>
  );
}
