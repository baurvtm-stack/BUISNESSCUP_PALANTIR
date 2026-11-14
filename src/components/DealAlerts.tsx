"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Notice } from "@/components/ui";
import { dealAlertProblem, getDealAlerts, getServerPro, setDealAlerts } from "@/lib/api/client";
import { useHydrated } from "@/lib/local-store";
import { proAccessStore } from "@/lib/saved-kits";

type Problem = ReturnType<typeof dealAlertProblem>;

export default function DealAlerts({ kitSlug, isPro }: { kitSlug?: string; isPro: boolean }) {
  const hydrated = useHydrated();
  const accessToken = proAccessStore.useValue();
  const descriptionId = useId();
  const generation = useRef<symbol | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    const current = Symbol();
    generation.current = current;
    setEnabled(false);
    setProblem(null);
    if (!isPro || !kitSlug || !accessToken) {
      setBusy(false);
      return;
    }
    setBusy(true);
    (async () => {
      const pro = await getServerPro(accessToken);
      const out = pro.kind !== "ok"
        ? pro
        : !pro.data.pro
          ? { kind: "rejected" as const, status: 403, message: "Pro is not active" }
          : await getDealAlerts(kitSlug, accessToken);
      if (generation.current !== current) return;
      if (out.kind === "ok") {
        setEnabled(out.data.enabled);
      } else {
        setProblem(dealAlertProblem(out));
      }
      setBusy(false);
    })();
    return () => { generation.current = null; };
  }, [isPro, kitSlug, accessToken]);

  async function toggle() {
    if (busy || !isPro || !kitSlug || !accessToken) return;
    const current = Symbol();
    generation.current = current;
    setBusy(true);
    setProblem(null);
    const out = await setDealAlerts({ kitSlug, enabled: !enabled }, accessToken);
    if (generation.current !== current) return;
    if (out.kind === "ok") {
      setEnabled(out.data.enabled);
    } else {
      setEnabled(false);
      setProblem(dealAlertProblem(out));
    }
    setBusy(false);
  }

  const on = enabled && isPro && !!kitSlug && !!accessToken;
  const thumb = <span className={`block size-6 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-6" : "translate-x-0"}`} />;

  return (
    <section aria-label="Deal alerts" className="rounded-3xl border border-line bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
            <Icon name="tag" className="size-5" />
          </span>
          <h2 className="font-display text-2xl font-bold leading-none">Deal alerts</h2>
        </div>
        {hydrated && !isPro ? (
          <Link href="/pro" aria-label="Get Pro to enable deal alerts" className="flex min-h-11 min-w-14 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
            <span className="block w-14 rounded-full bg-line-2 p-1" aria-hidden>{thumb}</span>
          </Link>
        ) : (
          <button
            type="button"
            role="switch"
            aria-label="Deal alerts"
            aria-checked={on}
            aria-describedby={descriptionId}
            disabled={!hydrated || busy || !kitSlug || !accessToken}
            onClick={toggle}
            className="flex min-h-11 min-w-14 items-center rounded-lg disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            <span className={`block w-14 rounded-full p-1 transition-colors ${on ? "bg-ok" : "bg-line-2"}`}>{thumb}</span>
          </button>
        )}
      </div>
      <p id={descriptionId} className="mt-3 text-sm leading-relaxed text-ink-2">
        Email me when an item&apos;s catalog price drops below the price saved with this kit.
      </p>
      {!hydrated ? (
        <p className="mt-3 text-sm text-ink-3">Loading…</p>
      ) : !isPro ? (
        <Link href="/pro" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-ink hover:underline">
          <Icon name="crown" className="size-4" /> Get deal alerts with Pro · $4/month
        </Link>
      ) : !kitSlug ? (
        <p className="mt-3 text-sm text-ink-2">Save this kit to the cloud to turn on deal alerts.</p>
      ) : !accessToken ? (
        <Notice tone="info" className="mt-3">
          This device has no Pro access key. Use the device where you started Checkout to enable email alerts.
        </Notice>
      ) : (
        <div aria-live="polite" aria-busy={busy}>
          <p className={`mt-3 text-sm font-semibold ${on ? "text-ok" : "text-ink-2"}`}>
            {busy ? "Checking…" : on ? "On — we’ll email you when the price drops." : "Off"}
          </p>
          {problem && (
            <Notice tone="info" className="mt-3">
              {problem.message}
              {problem.needsReminder && (
                <a href="#replacement-reminders" className="mt-1 block font-semibold underline underline-offset-4">
                  Set up replacement reminders
                </a>
              )}
            </Notice>
          )}
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-ink-3">Catalog prices are estimates. Check the retailer&apos;s current price before buying.</p>
    </section>
  );
}
