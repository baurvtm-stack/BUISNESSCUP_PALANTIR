import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui";
import { decodeAnswers } from "@/lib/answers";
import { decodeChoices } from "@/lib/kit-url";
import { buildKit } from "@/lib/server/kit-view";
import KitView from "./KitView";

type Props = { searchParams: Promise<{ k?: string; c?: string; s?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const answers = decodeAnswers((await searchParams).k);
  if (!answers) return { title: "Kit not found", robots: { index: false } };
  const kit = await buildKit(answers);
  const title = `${kit.tradeLabel} kit: $${Math.round(kit.totals.upfront)} today, $${kit.totals.perMonth.toFixed(0)}/mo`;
  const description = `${kit.items.length} pieces matched to ${kit.standards.slice(0, 3).join(", ")}. Built with GearFit.`;
  return { title, description, openGraph: { title, description }, robots: { index: false } };
}

export default async function KitPage({ searchParams }: Props) {
  const { k, c, s } = await searchParams;
  const answers = decodeAnswers(k);
  if (!answers) {
    return (
      <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <p className="font-display text-6xl font-extrabold text-accent-ink">404</p>
        <h1 className="mt-3 font-display text-3xl font-bold">We couldn&apos;t open this kit</h1>
        <p className="mt-2 text-ink-2">The link may be cut off. Building a new kit takes two minutes.</p>
        <ButtonLink href="/build" className="mt-6" iconRight="arrowRight">
          Build a kit
        </ButtonLink>
      </main>
    );
  }

  const kit = await buildKit(answers);
  const slug = s && /^[\w-]{1,64}$/.test(s) ? s : undefined;
  return (
    <main className="flex-1 pb-36 pt-6 sm:pb-16 sm:pt-10">
      <KitView kit={kit} initialChoices={decodeChoices(c, kit.items.length)} sharedSlug={slug} />
    </main>
  );
}
