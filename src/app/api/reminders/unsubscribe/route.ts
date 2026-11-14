import { ApiError, handle, json, rateLimit } from "@/lib/retention/core";
import {
  reminderRedirect,
  tokenFromRequest,
  unsubscribeReminder,
} from "@/lib/retention/reminders";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(async () => {
    await rateLimit(request, "reminder-unsubscribe", 60, 3600);
    const token = tokenFromRequest(request);
    return reminderRedirect(
      token ? await unsubscribeReminder(token) : { status: "invalid" },
    );
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimit(request, "reminder-unsubscribe", 60, 3600);
    const token = tokenFromRequest(request);
    if (!token || (await unsubscribeReminder(token)).status === "invalid") {
      throw new ApiError(400, "Invalid unsubscribe link");
    }
    return json({ status: "unsubscribed" });
  });
}
