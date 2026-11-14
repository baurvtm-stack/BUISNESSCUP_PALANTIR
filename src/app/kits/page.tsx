import type { Metadata } from "next";
import MyKits from "./MyKits";

export const metadata: Metadata = {
  title: "My kits",
  description: "Your saved work gear kits, with replacement dates and wear tracking.",
  robots: { index: false },
};

export default function KitsPage() {
  return (
    <main className="flex-1 pb-28 pt-6 sm:pt-10">
      <MyKits />
    </main>
  );
}
