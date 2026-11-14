import type { Metadata } from "next";
import ProView from "./ProView";

export const metadata: Metadata = {
  title: "GearFit Pro",
  description: "Wear tracking, deal alerts and unlimited saved kits for $4/month. Cancel anytime.",
};

export default async function ProPage({ searchParams }: { searchParams: Promise<{ status?: string; session_id?: string }> }) {
  const { status, session_id: sessionId } = await searchParams;
  const checkout = status === "success" ? "success" : status === "cancel" || status === "canceled" ? "cancel" : null;
  return (
    <main className="flex-1 pb-16">
      <ProView
        checkout={checkout}
        sessionId={sessionId && /^[\w-]{1,255}$/.test(sessionId) ? sessionId : undefined}
        testMode={process.env.NEXT_PUBLIC_STRIPE_MODE !== "live"}
      />
    </main>
  );
}
