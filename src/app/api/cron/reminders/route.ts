import {
  ApiError,
  handle,
  json,
  readJson,
  requireBearer,
} from "@/lib/retention/core";
import { demoSchema, runReminders } from "@/lib/retention/reminders";
import { dispatchDealAlerts } from "@/lib/retention/billing";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(async () => {
    requireBearer(request, "CRON_SECRET");
    const reminders = await runReminders();
    const deals = await dispatchDealAlerts();
    return json({ ...reminders, deals });
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    requireBearer(request, "CRON_SECRET");
    if (process.env.REMINDER_TEST_MODE !== "true")
      throw new ApiError(403, "Reminder test mode is disabled");
    const { kitSlug } = await readJson(request, demoSchema);
    return json(await runReminders(kitSlug));
  });
}
