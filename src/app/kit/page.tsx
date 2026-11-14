import type { Metadata } from "next";
import Link from "next/link";
import { buyUrl } from "@/data/products";
import { decodeAnswers } from "@/lib/answers";
import { recommend } from "@/lib/engine";
import KitView, { type ViewItem } from "./KitView";

type Props = { searchParams: Promise<{ k?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const answers = decodeAnswers((await searchParams).k);
  if (!answers) return { title: "Kit not found | GearFit" };
  const kit = recommend(answers);
  return {
    title: `${kit.tradeLabel} kit: $${Math.round(kit.totals.upfront)} | GearFit`,
    description: `A ${kit.items.length}-piece ${kit.tradeLabel.toLowerCase()} kit that meets ${kit.standards.slice(0, 3).join(", ")}. Real cost $${kit.totals.perMonth.toFixed(0)}/month.`,
  };
}

export default async function KitPage({ searchParams }: Props) {
  const token = (await searchParams).k;
  const answers = decodeAnswers(token);
  if (!answers || !token) {
    return (
      <main className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">We couldn&apos;t open this kit</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">The link may be incomplete. It only takes two minutes to build a new one.</p>
        <Link href="/build" className="mt-6 inline-block rounded-lg bg-amber-500 px-6 py-3 font-bold text-zinc-950">
          Build a kit
        </Link>
      </main>
    );
  }

  const kit = recommend(answers);
  const withUrl = (pick: (typeof kit.items)[number]["pick"]) => ({ ...pick, url: buyUrl(pick.product) });
  const items: ViewItem[] = kit.items.map((i) => ({
    label: i.label,
    category: i.category,
    optionsConsidered: i.optionsConsidered,
    pick: withUrl(i.pick),
    alternatives: i.alternatives.map((a) => ({ label: a.label, pick: withUrl(a.pick) })),
  }));

  return (
    <main className="px-4 py-10 sm:py-14">
      <KitView token={token} kit={{ ...kit, items: [] }} items={items} />
    </main>
  );
}
