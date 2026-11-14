import { handle, rateLimit } from "@/lib/retention/core";
import {
  confirmationForm,
  confirmReminder,
  reminderRedirect,
  tokenFromRequest,
} from "@/lib/retention/reminders";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(async () => {
    await rateLimit(request, "reminder-confirm", 60, 3600);
    const token = tokenFromRequest(request);
    return token
      ? confirmationForm(token)
      : reminderRedirect({ status: "invalid" });
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimit(request, "reminder-confirm", 60, 3600);
    const token = tokenFromRequest(request);
    return reminderRedirect(
      token ? await confirmReminder(token) : { status: "invalid" },
    );
  });
}
