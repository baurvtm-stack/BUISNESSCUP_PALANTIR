import type { Metadata } from "next";
import { decodeAnswers } from "@/lib/answers";
import { getWizardData } from "@/lib/server/kit-view";
import Wizard from "./Wizard";

export const metadata: Metadata = {
  title: "Build your kit",
  description: "Five quick questions about your trade, site and budget. Get a complete, standards-matched work gear kit.",
};

export default async function BuildPage({ searchParams }: { searchParams: Promise<{ trade?: string; k?: string }> }) {
  const { trade, k } = await searchParams;
  const data = await getWizardData();
  // ?k= reopens an existing kit for editing; ?trade= comes from the trade links on the landing page.
  const editing = decodeAnswers(k);
  const initialTrade = !editing && trade && data.trades.some((t) => t.id === trade) ? trade : undefined;
  return (
    <main className="flex-1 pb-40 pt-6 sm:pt-10 lg:pb-16">
      <Wizard data={data} initial={editing ?? undefined} initialTrade={initialTrade} />
    </main>
  );
}
