import { handle, json } from "@/lib/retention/core";
import { resolvePro } from "@/lib/retention/billing";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(async () => {
    const pro = await resolvePro(request);
    return json({
      pro: !!pro,
      features: pro
        ? ["unlimited_saved_kits", "wear_tracking", "deal_alerts"]
        : [],
    });
  });
}
