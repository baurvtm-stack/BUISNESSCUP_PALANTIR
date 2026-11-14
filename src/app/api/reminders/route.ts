import { ApiError, db, handle, hashToken, json, rateLimit, readJson } from "@/lib/retention/core";
import { registerReminder, reminderSignupSchema } from "@/lib/retention/reminders";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimit(request, "reminders", 5, 3600);
    const input = await readJson(request, reminderSignupSchema);
    // Limit the recipient across IPs as well, so a distributed caller cannot
    // flood one mailbox with confirmation messages. No address is stored here.
    const { data: allowed, error } = await db().rpc("retention_rate_limit", {
      p_key: `reminder-email:${hashToken(input.email)}`, p_limit: 3, p_window_seconds: 3600,
    });
    if (error) throw new ApiError(503, "Rate limiter unavailable");
    if (!allowed) throw new ApiError(429, "Rate limit reached; try again later");
    await registerReminder(input);
    return json({ status: "confirmation_required", message: "If confirmation is needed, check your email." }, 202);
  });
}
