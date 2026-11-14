import type { Metadata } from "next";
import { Icon, type IconName } from "@/components/icons";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Reminders", robots: { index: false } };

/**
 * Landing page for links in reminder emails. The reminder API redirects here with
 * ?status=confirmed | unsubscribed | expired | invalid after handling the token.
 */
const STATES: Record<string, { icon: IconName; tone: string; title: string; body: string }> = {
  confirmed: {
    icon: "checkCircle",
    tone: "bg-ok-soft text-ok",
    title: "Reminders are on",
    body: "We'll email you a week before each item in your kit is due for replacement, with a link to reorder it.",
  },
  unsubscribed: {
    icon: "bell",
    tone: "bg-sunken text-ink-2",
    title: "You're unsubscribed",
    body: "You won't get any more reminder emails for this kit. Your kit link still works whenever you need it.",
  },
  expired: {
    icon: "clock",
    tone: "bg-warn-soft text-warn",
    title: "This link has expired",
    body: "Open your kit and sign up for reminders again; it only takes a second.",
  },
  invalid: {
    icon: "alert",
    tone: "bg-warn-soft text-warn",
    title: "We couldn't use this link",
    body: "It may have been cut off by your email app. Open your kit and sign up for reminders again.",
  },
};

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ status?: string; kit?: string }> }) {
  const { status, kit } = await searchParams;
  const state = STATES[status ?? ""] ?? STATES.invalid;
  const kitLink = kit && /^[\w-]{1,64}$/.test(kit) ? `/k/${kit}` : "/kits";
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-24">
      <div className="max-w-md text-center">
        <span className={`mx-auto flex size-14 items-center justify-center rounded-2xl ${state.tone}`}>
          <Icon name={state.icon} className="size-7" />
        </span>
        <h1 className="mt-5 font-display text-4xl font-bold">{state.title}</h1>
        <p className="mt-3 leading-relaxed text-ink-2">{state.body}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <ButtonLink href={kitLink} iconRight="arrowRight">
            Open my kit
          </ButtonLink>
          <ButtonLink href="/build" variant="outline">
            Build another kit
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
