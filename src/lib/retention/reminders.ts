import { z } from "zod";
import { ApiError, baseUrl, db, env, hashToken, randomToken } from "./core";

export const reminderSignupSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  kitSlug: z.string().regex(/^[A-Za-z0-9_-]{6,32}$/),
}).strict();
export const demoSchema = reminderSignupSchema.pick({ kitSlug: true });
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{40,128}$/);

export function tokenFromRequest(request: Request): string {
  const parsed = tokenSchema.safeParse(new URL(request.url).searchParams.get("token"));
  if (!parsed.success) throw new ApiError(400, "Invalid or expired link");
  return parsed.data;
}

export class EmailError extends Error {
  constructor(public readonly definiteFailure: boolean) { super("Email provider unavailable"); }
}

/** Never log provider response bodies: these may contain addresses and tokens. */
export async function sendEmail(message: {
  to: string; subject: string; text: string; key: string; unsubscribeUrl?: string;
}): Promise<void> {
  const apiKey = env("RESEND_API_KEY");
  const from = env("RESEND_FROM");
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": message.key },
      body: JSON.stringify({
        from, to: [message.to], subject: message.subject, text: message.text,
        ...(message.unsubscribeUrl ? { headers: {
          "List-Unsubscribe": `<${message.unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        } } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch { throw new EmailError(false); }
  if (!response.ok) {
    // Rate limits / invalid requests are known not to have sent. Server errors,
    // timeouts and idempotency conflicts are ambiguous and retain retry identity.
    throw new EmailError(response.status >= 400 && response.status < 500 && response.status !== 409);
  }
}

export async function registerReminder(input: z.infer<typeof reminderSignupSchema>): Promise<void> {
  const client = db();
  const { data: kit, error: kitError } = await client.from("kits").select("id").eq("slug", input.kitSlug).maybeSingle();
  if (kitError) throw new ApiError(503, "Database unavailable");
  if (!kit) throw new ApiError(404, "Kit not found");
  const token = randomToken();
  const { data: shouldSend, error } = await client.rpc("register_reminder", {
    p_email: input.email, p_slug: input.kitSlug,
    p_confirm_hash: hashToken(token), p_unsubscribe_token: randomToken(),
  });
  if (error) throw new ApiError(503, "Could not save reminder");
  if (!shouldSend) return;
  const confirmUrl = `${baseUrl()}/api/reminders/confirm?token=${token}`;
  await sendEmail({
    to: input.email, subject: "Confirm your GearFit replacement reminders",
    text: `Confirm reminders for your saved kit by opening this link and pressing Confirm:\n${confirmUrl}\n\nThis link expires in 24 hours. If you did not request reminders, ignore this email.`,
    key: `reminder-confirm/${hashToken(token)}`,
  });
}

export async function confirmReminder(token: string): Promise<void> {
  const { data, error } = await db().rpc("confirm_reminder", { p_hash: hashToken(token) });
  if (error) throw new ApiError(503, "Could not confirm reminder");
  if (!data) throw new ApiError(400, "Invalid or expired link; request reminders again");
}

export async function unsubscribeReminder(token: string): Promise<void> {
  const { data, error } = await db().rpc("unsubscribe_reminder", { p_token: token });
  if (error) throw new ApiError(503, "Could not unsubscribe");
  if (!data) throw new ApiError(400, "Invalid unsubscribe link");
}

export function confirmationForm(token: string): Response {
  // token has already passed the URL-safe token schema; no user HTML is inserted.
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Confirm GearFit reminders</title><body><h1>Confirm replacement reminders</h1><p>Press Confirm to receive replacement reminders for this kit.</p><form method="post" action="/api/reminders/confirm?token=${token}"><button type="submit">Confirm</button></form></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'" },
  });
}

type Delivery = { id: string; reminder_id: string; item_name: string; email: string; kit_slug: string; unsubscribe_token: string; is_demo: boolean };

/** One delivery per item. Demo deliveries are separate and never consume real reminders. */
export async function runReminders(demoKitSlug?: string): Promise<{ sent: number; failed: number; queued: number }> {
  const client = db();
  let queued = 0;
  if (demoKitSlug) {
    const { data, error } = await client.rpc("queue_demo_reminders", { p_slug: demoKitSlug });
    if (error) throw new ApiError(503, "Could not queue demo reminders");
    queued = data ?? 0;
  }
  let sent = 0;
  let failed = 0;
  const deadline = Date.now() + 15000;
  for (let count = 0; count < 20 && Date.now() < deadline; count++) {
    const { data, error } = await client.rpc("claim_reminder_delivery", { p_demo: !!demoKitSlug, p_slug: demoKitSlug ?? null });
    if (error) throw new ApiError(503, "Could not claim reminders");
    const delivery = (data as Delivery[] | null)?.[0];
    if (!delivery) break;
    const { data: subscriber, error: lookupError } = await client.from("reminders")
      .select("confirmed_at,unsubscribed_at").eq("id", delivery.reminder_id).single();
    if (lookupError) throw new ApiError(503, "Could not check reminder consent");
    // Recheck after claim to honor an unsubscribe as close to sending as possible.
    if (!subscriber?.confirmed_at || subscriber.unsubscribed_at) continue;
    const unsubscribeUrl = `${baseUrl()}/api/reminders/unsubscribe?token=${delivery.unsubscribe_token}`;
    const text = `${delivery.is_demo ? "DEMO — no gear is due yet.\n\n" : ""}${delivery.item_name} has reached its estimated replacement date. Inspect your gear and follow the manufacturer's and your workplace's replacement rules.\n\nSaved kit: ${baseUrl()}/api/kits/${delivery.kit_slug}\n\nUnsubscribe: ${unsubscribeUrl}`;
    try {
      await sendEmail({ to: delivery.email, subject: delivery.is_demo ? "GearFit demo replacement reminder" : "GearFit: time to inspect and replace your gear", text, key: `reminder/${delivery.id}`, unsubscribeUrl });
    } catch (error) {
      failed++;
      const { error: updateError } = await client.from("reminder_deliveries").update({
        last_error: "email_provider_failure",
        ...(error instanceof EmailError && error.definiteFailure ? { first_attempt_at: null } : {}),
      }).eq("id", delivery.id);
      if (updateError) throw new ApiError(503, "Could not record delivery failure");
      // Leave the five-minute lease to avoid tight retries / provider throttling.
      continue;
    }
    const { error: updateError } = await client.from("reminder_deliveries")
      .update({ sent_at: new Date().toISOString(), claim_until: null, last_error: null }).eq("id", delivery.id);
    if (updateError) throw new ApiError(503, "Delivery accepted; database update failed");
    sent++;
    // Resend's default account limit is two requests per second.
    await new Promise((resolve) => setTimeout(resolve, 550));
  }
  return { sent, failed, queued };
}
