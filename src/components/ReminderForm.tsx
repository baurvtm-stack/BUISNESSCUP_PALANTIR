"use client";

import { useState } from "react";
import { subscribeReminders } from "@/lib/api/client";
import type { KitItemSnapshot } from "@/lib/api/contract";
import { isEmail } from "@/lib/format";
import { downloadReminders } from "@/lib/kit-actions";
import { emailStore, reminderState } from "@/lib/saved-kits";
import { Icon } from "./icons";
import { Button, Notice } from "./ui";

type Status = "idle" | "sending" | "pending" | "confirmed" | "unavailable";

/**
 * Email replacement reminders (POST /api/reminders, double opt-in). Needs a cloud slug for
 * the kit; when the backend isn't live it falls back to a calendar file.
 */
export default function ReminderForm({
  getSlug,
  items,
  activeEmail,
  confirmedEmail,
  onSubscribed,
  tone = "card",
}: {
  getSlug: () => Promise<string | null>;
  items: KitItemSnapshot[];
  activeEmail?: string;
  /** The email this device saw confirmed; shows "Reminders are on" instead of "check your inbox". */
  confirmedEmail?: string;
  onSubscribed?: (email: string, status: "pending" | "confirmed") => void;
  tone?: "card" | "plain";
}) {
  const savedEmail = emailStore.useValue();
  const [email, setEmail] = useState("");
  // Null until the shopper acts here. Until then the card shows what this device recorded for
  // the kit, which only arrives after hydration and changes if the emailed link is opened in another tab.
  const [action, setAction] = useState<Status | null>(null);
  const recorded = reminderState(activeEmail, confirmedEmail);
  const status = action ?? recorded;
  const [error, setError] = useState<string | null>(null);
  const value = email || savedEmail;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const address = value.trim();
    if (!isEmail(address)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setAction("sending");
    emailStore.set(address);
    const slug = await getSlug();
    if (!slug) {
      setAction("unavailable");
      return;
    }
    const out = await subscribeReminders({ email: address, kitSlug: slug });
    if (out.kind === "ok") {
      setAction(out.data.status);
      onSubscribed?.(address, out.data.status);
    } else if (out.kind === "rejected") {
      setAction("idle");
      setError(out.status === 429 ? "Too many tries. Please wait a minute and try again." : out.message);
    } else {
      setAction("unavailable");
    }
  }

  const done = status === "pending" || status === "confirmed";
  const confirmed = status === "confirmed" || (status === "pending" && recorded === "confirmed");
  const shown = activeEmail && done && !email ? activeEmail : value;

  return (
    <div className={tone === "card" ? "rounded-3xl border border-line bg-card p-5 sm:p-6" : ""}>
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
          <Icon name="bell" className="size-5" />
        </span>
        <h2 className="font-display text-2xl font-bold leading-none">Replacement reminders</h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">
        We&apos;ll email you before each item wears out, with a link to reorder the exact same one. Free, one click to unsubscribe.
      </p>

      {done ? (
        <div className="mt-4">
          <Notice tone="ok">
            {confirmed ? (
              <>Reminders are on for <b>{shown}</b>.</>
            ) : (
              <>
                Check your inbox: we sent a confirmation link to <b>{shown}</b>. Reminders start once you confirm.
              </>
            )}
          </Notice>
          <button
            type="button"
            onClick={() => {
              setEmail(shown);
              setAction("idle");
              setError(null);
            }}
            className="mt-1 min-h-11 text-left text-sm font-semibold text-accent-ink underline-offset-4 hover:underline"
          >
            {confirmed ? "Add another email" : "Resend or use another email"}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 flex gap-2" noValidate>
          <label className="sr-only" htmlFor="reminder-email">
            Email
          </label>
          <input
            id="reminder-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={value}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="you@example.com"
            aria-invalid={!!error}
            className="h-12 min-w-0 flex-1 rounded-xl border border-line-2 bg-paper px-3.5 text-base outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <Button type="submit" size="lg" className="px-4" disabled={status === "sending"}>
            {status === "sending" ? "Saving…" : "Remind me"}
          </Button>
        </form>
      )}

      {error && (
        <Notice tone="danger" className="mt-3">
          {error}
        </Notice>
      )}
      {status === "unavailable" && (
        <Notice tone="info" className="mt-3">
          Email reminders are switching on soon. For now, add the replacement dates to your calendar.
        </Notice>
      )}

      <button
        type="button"
        onClick={() => downloadReminders(items)}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline"
      >
        <Icon name="calendar" className="size-4" />
        Add replacement dates to my calendar
      </button>
    </div>
  );
}
