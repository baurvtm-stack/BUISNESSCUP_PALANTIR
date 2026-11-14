"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Button, ButtonLink, Eyebrow, Notice } from "@/components/ui";
import { getCheckoutStatus, getServerPro, MOCKS_ENABLED, startCheckout } from "@/lib/api/client";
import { isEmail, shortDate } from "@/lib/format";
import { useHydrated } from "@/lib/local-store";
import { emailStore, FREE_KIT_LIMIT, proAccessStore, proStore } from "@/lib/saved-kits";

const PRICE = 4;

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "clock",
    title: "Wear tracker",
    body: "Every item in every kit gets a countdown from the day you bought it. Mark it replaced and the clock resets.",
  },
  {
    icon: "tag",
    title: "Deal alerts",
    body: "Enable alerts on a saved kit and get an email when its catalog price drops. Confirm the retailer's price before buying.",
  },
  {
    icon: "bookmark",
    title: "Unlimited kits",
    body: `Free keeps ${FREE_KIT_LIMIT}. Pro keeps a kit for every season, site and apprentice.`,
  },
];

const PLAN_ROWS: [string, boolean, boolean][] = [
  ["Standards-matched kit for your trade", true, true],
  ["Cost per month and swap options", true, true],
  ["Compare price tiers side by side", true, true],
  ["Email and calendar replacement reminders", true, true],
  [`Saved kits`, true, true],
  ["Wear tracker for every item", false, true],
  ["Deal alerts on your exact gear", false, true],
];

export default function ProView({
  checkout,
  sessionId,
  testMode,
}: {
  checkout: "success" | "cancel" | null;
  sessionId?: string;
  testMode: boolean;
}) {
  const hydrated = useHydrated();
  const pro = proStore.useValue();
  const accessToken = proAccessStore.useValue();
  const savedEmail = emailStore.useValue();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "confirming" | "unavailable">(checkout === "success" ? "confirming" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [welcome, setWelcome] = useState(false);
  const confirmed = useRef(false);
  const [serverPro, setServerPro] = useState<boolean | null>(null);
  const [serverError, setServerError] = useState(false);

  useEffect(() => {
    let active = true;
    setServerPro(null);
    setServerError(false);
    if (!pro || !accessToken) return;
    getServerPro(accessToken).then((out) => {
      if (!active) return;
      if (out.kind === "ok") setServerPro(out.data.pro);
      else setServerError(true);
    });
    return () => { active = false; };
  }, [pro, accessToken]);

  // After Stripe redirects back, confirm the session once and turn Pro on for this device.
  useEffect(() => {
    if (checkout !== "success" || confirmed.current) return;
    confirmed.current = true;
    (async () => {
      const looksReal = !!sessionId && (/^cs_(test|live)_/.test(sessionId) || (MOCKS_ENABLED && sessionId.startsWith("mock_")));
      if (!sessionId || !looksReal) {
        setState("idle");
        return;
      }
      const out = await getCheckoutStatus(sessionId);
      const fallbackEmail = emailStore.get();
      const activatedAt = new Date().toISOString();
      if (out.kind === "ok" && out.data.active) {
        proStore.set({ email: out.data.email ?? fallbackEmail, activatedAt, source: "stripe" });
        setWelcome(true);
      } else if (out.kind === "unavailable") {
        // Stripe only sends people to success_url after payment. Server-side features still
        // check the subscription stored by the webhook; this only unlocks the UI on this device.
        proStore.set({ email: fallbackEmail, activatedAt, source: sessionId.startsWith("mock_") ? "demo" : "stripe" });
        setWelcome(true);
      } else {
        setError("We couldn't confirm the payment yet. If you were charged, refresh this page in a minute.");
      }
      setState("idle");
      window.history.replaceState(null, "", "/pro");
    })();
  }, [checkout, sessionId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const address = (email || savedEmail).trim();
    if (!isEmail(address)) {
      setError("Enter a valid email for your receipt and alerts.");
      return;
    }
    setError(null);
    setState("loading");
    emailStore.set(address);
    const out = await startCheckout({ email: address });
    if (out.kind === "ok") {
      proAccessStore.set(out.data.accessToken ?? null);
      window.location.assign(out.data.url);
      return;
    }
    setState(out.kind === "unavailable" ? "unavailable" : "idle");
    if (out.kind === "rejected") setError(out.status === 429 ? "Too many tries. Wait a minute and try again." : out.message);
  }

  return (
    <>
      <section className="relative overflow-hidden bg-steel text-steel-ink">
        <div className="hazard absolute inset-x-0 top-0 h-2" aria-hidden />
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14">
          <div className="animate-rise">
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-accent">
              <Icon name="crown" className="size-5" /> GearFit Pro
            </p>
            <h1 className="mt-4 font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
              Never wear it out. Never pay full price.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-steel-muted">
              Pro keeps an eye on every item in your kits: how worn it is, when it goes on sale, and when it&apos;s time to
              reorder.
            </p>
            <ul className="mt-8 space-y-4">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex gap-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-accent">
                    <Icon name={f.icon} className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold">{f.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-steel-muted">{f.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="animate-rise rounded-[28px] bg-card p-6 text-ink shadow-2xl shadow-black/30 [animation-delay:100ms] sm:p-8">
            {checkout === "cancel" && !pro && (
              <Notice tone="info" className="mb-5">
                Checkout canceled. You weren&apos;t charged.
              </Notice>
            )}
            {welcome && pro && (
              <Notice tone="ok" className="mb-5">
                Payment confirmed. Welcome to Pro!
              </Notice>
            )}

            {!hydrated || state === "confirming" ? (
              <div className="space-y-3" aria-busy>
                <div className="skeleton h-10 w-40 rounded-lg" />
                <div className="skeleton h-12 rounded-xl" />
                <div className="skeleton h-12 rounded-xl" />
              </div>
            ) : pro ? (
              <div>
                <p className="flex items-center gap-2 font-semibold text-ok">
                  <Icon name="checkCircle" className="size-5" /> Pro is active
                </p>
                <p className="mt-3 font-display text-3xl font-bold">You&apos;re all set.</p>
                <p className="mt-2 text-ink-2">
                  {pro.email ? (
                    <>
                      Pro email: <b>{pro.email}</b>.{" "}
                    </>
                  ) : null}
                  Active since {shortDate(pro.activatedAt)}
                  {pro.source === "demo" ? " (demo mode)" : ""}.
                </p>
                <Notice tone={serverPro ? "ok" : "info"} className="mt-4">
                  {!accessToken
                    ? "Use the device where you started Checkout to enable email deal alerts."
                    : serverError
                      ? "Deal alerts are temporarily unavailable. Please try again."
                      : serverPro === null
                        ? "Checking your email alert access…"
                        : serverPro
                          ? "Deal alerts are ready. Open a saved kit, confirm replacement reminders with your Pro email, then turn on Deal alerts."
                          : "Pro isn't active on the server yet. Refresh in a minute."}
                </Notice>
                <ButtonLink href="/kits" className="mt-6 w-full" size="lg" iconRight="arrowRight">
                  Open the wear tracker
                </ButtonLink>
              </div>
            ) : (
              <form onSubmit={onSubmit} noValidate>
                <p className="flex items-baseline gap-1.5">
                  <span className="font-display text-6xl font-extrabold tracking-tight">${PRICE}</span>
                  <span className="text-lg font-semibold text-ink-2">/month</span>
                </p>
                <p className="mt-1 text-sm text-ink-3">Cancel anytime. No contract.</p>
                <label className="mt-6 block">
                  <span className="text-sm font-semibold">Email for receipts and alerts</span>
                  <input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email || savedEmail}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    placeholder="you@example.com"
                    aria-invalid={!!error}
                    className="mt-1.5 h-12 w-full rounded-xl border border-line-2 bg-paper px-3.5 text-base outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                </label>
                <Button type="submit" size="lg" className="mt-4 w-full" disabled={state === "loading"} iconRight={state === "loading" ? undefined : "arrowRight"}>
                  {state === "loading" ? "Opening secure checkout…" : `Start Pro for $${PRICE}/month`}
                </Button>
                {error && (
                  <Notice tone="danger" className="mt-3">
                    {error}
                  </Notice>
                )}
                {state === "unavailable" && (
                  <Notice tone="info" className="mt-3">
                    Checkout is being connected right now. Please try again in a few minutes.
                  </Notice>
                )}
                <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-3">
                  <Icon name="lock" className="size-3.5" /> Secure payment by Stripe. We never see your card.
                </p>
                {testMode && (
                  <p className="mt-3 rounded-xl bg-sunken px-3 py-2.5 text-xs leading-relaxed text-ink-2">
                    <b>Demo:</b> payments run in Stripe test mode. Use card <span className="tabular font-semibold">4242 4242 4242 4242</span>,
                    any future date and any CVC.
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            <Eyebrow>Pays for itself</Eyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold leading-[1.02] tracking-tight sm:text-5xl">
              One sale on boots covers a year of Pro.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-2">
              A 25% sale on a $200 pair of work boots saves $50. A year of Pro costs ${PRICE * 12}. Replacing worn gear on time, not
              after it fails on the job, is the part you can&apos;t put a price on.
            </p>
            <Link href="/build" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-accent-ink hover:underline">
              Build a kit first, it&apos;s free <Icon name="arrowRight" className="size-4" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-3xl border border-line bg-card">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Free and Pro plans compared</caption>
              <thead className="bg-sunken text-xs uppercase tracking-[0.12em] text-ink-3">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold sm:px-5">
                    Feature
                  </th>
                  <th scope="col" className="w-20 px-2 py-3 text-center font-semibold">
                    Free
                  </th>
                  <th scope="col" className="w-20 px-2 py-3 text-center font-semibold text-accent-ink">
                    Pro
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {PLAN_ROWS.map(([label, free, paid]) => (
                  <tr key={label}>
                    <th scope="row" className="px-4 py-3.5 font-medium sm:px-5">
                      {label}
                      {label === "Saved kits" && <span className="block text-xs font-normal text-ink-3">Free: {FREE_KIT_LIMIT} · Pro: unlimited</span>}
                    </th>
                    <td className="px-2 text-center">{mark(free)}</td>
                    <td className="px-2 text-center">{mark(paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-card">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-12 gap-y-8 px-4 py-16 sm:px-6 md:grid-cols-2">
          {[
            ["Can I cancel anytime?", "Yes. There's no contract and no cancellation fee. Pro is billed month to month."],
            ["What happens to my kits if I cancel?", "Nothing is deleted. Your kits stay on your device; you just go back to the free limits."],
            ["Is the kit builder still free?", "Always. Building, comparing and sharing kits, plus replacement reminders, stay free."],
            ["Who handles payment?", "Stripe processes every payment. GearFit never sees or stores your card number."],
          ].map(([q, a]) => (
            <div key={q}>
              <h3 className="font-semibold">{q}</h3>
              <p className="mt-1.5 leading-relaxed text-ink-2">{a}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function mark(on: boolean) {
  return on ? (
    <span className="inline-flex size-6 items-center justify-center rounded-full bg-ok-soft text-ok">
      <Icon name="check" className="size-3.5" strokeWidth={3} />
      <span className="sr-only">Included</span>
    </span>
  ) : (
    <span className="text-ink-3">
      <Icon name="minus" className="mx-auto size-4" />
      <span className="sr-only">Not included</span>
    </span>
  );
}
