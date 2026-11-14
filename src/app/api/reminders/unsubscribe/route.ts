import { handle, json, rateLimit } from "@/lib/retention/core";
import { tokenFromRequest, unsubscribeReminder } from "@/lib/retention/reminders";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(async () => {
    await unsubscribeReminder(tokenFromRequest(request));
    return json({ status: "unsubscribed", message: "You will no longer receive reminders for this kit." });
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimit(request, "reminder-unsubscribe", 60, 3600);
    await unsubscribeReminder(tokenFromRequest(request));
    return json({ status: "unsubscribed" });
  });
}
