import type { Metadata } from "next";
import { tradeById } from "@/data/trades";
import Wizard from "./Wizard";

export const metadata: Metadata = { title: "Build your kit | GearFit" };

export default async function BuildPage({ searchParams }: { searchParams: Promise<{ trade?: string }> }) {
  const { trade } = await searchParams;
  return (
    <main className="px-4 py-10 sm:py-16">
      <Wizard initialTrade={trade && tradeById(trade) ? trade : undefined} />
    </main>
  );
}
