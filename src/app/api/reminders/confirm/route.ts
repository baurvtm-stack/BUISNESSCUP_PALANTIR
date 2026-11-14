import { handle, json, rateLimit } from "@/lib/retention/core";
import { confirmationForm, confirmReminder, tokenFromRequest } from "@/lib/retention/reminders";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(async () => confirmationForm(tokenFromRequest(request)));
}
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimit(request, "reminder-confirm", 30, 3600);
    await confirmReminder(tokenFromRequest(request));
    return json({ status: "confirmed", message: "Your replacement reminders are enabled." });
  });
}
