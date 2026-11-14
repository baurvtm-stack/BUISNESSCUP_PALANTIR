import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, baseUrl, db, env, hashToken } from "@/lib/retention/core";
import { PRODUCTS } from "@/data/products";
import type { CategoryResult, Product } from "@/lib/types";
import { sendEmail } from "@/lib/retention/reminders";
import { getProducts } from "@/lib/server/catalog";
import { proAccessTokenSchema } from "@/lib/retention/validation";

export { emailSchema, kitSlugSchema } from "@/lib/retention/validation";
export const checkoutSessionSchema = z
  .string()
  .regex(/^cs_test_[A-Za-z0-9]{1,240}$/);

export function stripeClient() {
  const key = env("STRIPE_SECRET_KEY");
  if (!key.startsWith("sk_test_"))
    throw new ApiError(503, "Stripe test mode is required");
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 10000 });
}

/** The redirect is only a lookup key; Stripe and the server checkout binding
 * establish access. Persist an activation even when a webhook is delayed. */
export async function checkoutStatus(
  sessionId: string,
): Promise<{ active: boolean; email: string }> {
  const stripe = stripeClient();
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      error.code === "resource_missing"
    ) {
      throw new ApiError(404, "Checkout not found");
    }
    throw error;
  }
  const checkoutId = z
    .string()
    .uuid()
    .safeParse(session.metadata?.gearfit_checkout_id);
  if (
    session.livemode ||
    session.mode !== "subscription" ||
    !checkoutId.success
  ) {
    throw new ApiError(404, "Checkout not found");
  }
  const { data: checkout, error } = await db()
    .from("pro_checkouts")
    .select("id,email")
    .eq("id", checkoutId.data)
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (error) throw new ApiError(503, "Subscription lookup unavailable");
  if (!checkout) throw new ApiError(404, "Checkout not found");
  if (session.status !== "complete" || !session.subscription) {
    return { active: false, email: checkout.email };
  }
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (
    subscription.livemode ||
    subscription.metadata.gearfit_checkout_id !== checkoutId.data
  ) {
    throw new ApiError(404, "Checkout not found");
  }
  const item = subscription.items.data[0];
  if (
    subscription.items.data.length !== 1 ||
    item?.quantity !== 1 ||
    item.price.unit_amount !== 400 ||
    item.price.currency !== "usd" ||
    item.price.recurring?.interval !== "month" ||
    item.price.recurring.interval_count !== 1
  ) {
    throw new ApiError(400, "Unexpected subscription plan");
  }
  const active =
    subscription.status === "active" || subscription.status === "trialing";
  if (active) {
    const { error: saveError } = await db().rpc("apply_stripe_subscription", {
      p_event_id: `checkout:${session.id}`,
      p_event_created: Math.floor(Date.now() / 1000),
      p_subscription_id: subscription.id,
      p_checkout_id: checkoutId.data,
      p_email: checkout.email,
      p_status: subscription.status,
      p_customer_id:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      p_cancel_at_period_end: subscription.cancel_at_period_end,
      p_current_period_end: new Date(
        item.current_period_end * 1000,
      ).toISOString(),
    });
    if (saveError) throw new ApiError(503, "Subscription update unavailable");
  }
  return { active, email: checkout.email };
}

export async function resolvePro(
  request: Request,
): Promise<{ email: string; checkoutId: string } | null> {
  const token = proAccessTokenSchema.safeParse(request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1]);
  if (!token.success) return null;
  const { data: checkout, error } = await db()
    .from("pro_checkouts")
    .select("id,email")
    .eq("token_hash", hashToken(token.data))
    .maybeSingle();
  if (error) throw new ApiError(503, "Subscription lookup unavailable");
  if (!checkout) return null;
  const { data: subscription, error: subscriptionError } = await db()
    .from("subscriptions")
    .select("status")
    .eq("checkout_id", checkout.id)
    .eq("status", "active")
    .gt("current_period_end", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (subscriptionError)
    throw new ApiError(503, "Subscription lookup unavailable");
  return subscription
    ? { email: checkout.email, checkoutId: checkout.id }
    : null;
}

export async function requirePro(request: Request) {
  const pro = await resolvePro(request);
  if (!pro) throw new ApiError(403, "An active Pro access token is required");
  return pro;
}

export async function processStripeEvent(event: Stripe.Event, stripe: Stripe) {
  if (event.livemode)
    throw new ApiError(400, "Live Stripe events are not supported");
  let subscriptionId: string | undefined;
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== "subscription") return;
    subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
  } else if (
    [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ].includes(event.type)
  ) {
    subscriptionId = (event.data.object as Stripe.Subscription).id;
  } else return;
  if (!subscriptionId) return;
  // Fetch current state: webhook delivery order is not guaranteed.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const checkoutId = subscription.metadata.gearfit_checkout_id;
  if (!checkoutId || subscription.livemode) return;
  const price = subscription.items.data[0]?.price;
  if (
    subscription.items.data.length !== 1 ||
    price?.unit_amount !== 400 ||
    price.currency !== "usd" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    subscription.items.data[0]?.quantity !== 1
  ) {
    throw new ApiError(400, "Unexpected subscription plan");
  }
  const { data: checkout, error } = await db()
    .from("pro_checkouts")
    .select("id,email")
    .eq("id", checkoutId)
    .maybeSingle();
  if (error) throw new ApiError(503, "Subscription lookup unavailable");
  if (!checkout) throw new ApiError(503, "Checkout binding is not ready");
  const { error: saveError } = await db().rpc("apply_stripe_subscription", {
    p_event_id: event.id,
    p_event_created: event.created,
    p_subscription_id: subscription.id,
    p_checkout_id: checkoutId,
    p_email: checkout.email,
    p_status: subscription.status,
    p_customer_id:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
    p_cancel_at_period_end: subscription.cancel_at_period_end,
    p_current_period_end: new Date(
      subscription.items.data[0].current_period_end * 1000,
    ).toISOString(),
  });
  if (saveError) throw new ApiError(503, "Subscription update unavailable");
}

export async function findDeals(items: CategoryResult[], products?: readonly Product[]) {
  // Price checks deliberately bypass the page/click cache so edits are visible immediately.
  const catalog = products ?? await getProducts().catch(() => PRODUCTS);
  return items.flatMap((item) => {
    const current = catalog.find(
      (product) => product.id === item.pick.product.id,
    );
    return current && current.price < item.pick.product.price
      ? [
          {
            productId: current.id,
            name: current.name,
            savedPrice: item.pick.product.price,
            currentPrice: current.price,
          },
        ]
      : [];
  });
}

/** Catalog price drops only: no invented discounts or promotional mail without double opt-in. */
export async function dispatchDealAlerts(): Promise<{
  sent: number;
  failed: number;
}> {
  const { data: alerts, error } = await db()
    .from("pro_deal_alerts")
    .select("id,email,kit_slug,checkout_id")
    .eq("enabled", true)
    .order("last_checked_at", { ascending: true })
    .limit(10);
  if (error) throw new ApiError(503, "Deal alerts unavailable");
  let sent = 0;
  let failed = 0;
  const deadline = Date.now() + 15000;
  if (!alerts?.length) return { sent, failed };
  const products = await getProducts().catch(() => PRODUCTS);
  for (const alert of alerts ?? []) {
    if (Date.now() > deadline) break;
    const { error: checkedError } = await db()
      .from("pro_deal_alerts")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", alert.id);
    if (checkedError) {
      failed++;
      continue;
    }
    const { data: subscription, error: subError } = await db()
      .from("subscriptions")
      .select("id")
      .eq("checkout_id", alert.checkout_id)
      .eq("status", "active")
      .gt("current_period_end", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (subError) {
      failed++;
      continue;
    }
    if (!subscription) continue;
    const { data: kit, error: kitError } = await db()
      .from("kits")
      .select("id,items")
      .eq("slug", alert.kit_slug)
      .maybeSingle();
    if (kitError) {
      failed++;
      continue;
    }
    if (!kit) continue;
    const { data: reminder, error: reminderError } = await db()
      .from("reminders")
      .select("id,unsubscribe_token")
      .eq("email", alert.email)
      .eq("kit_id", kit.id)
      .not("confirmed_at", "is", null)
      .is("unsubscribed_at", null)
      .maybeSingle();
    if (reminderError) {
      failed++;
      continue;
    }
    if (!reminder) continue;
    const deals = await findDeals(kit.items as CategoryResult[], products);
    if (!deals.length) continue;
    const fingerprint = hashToken(
      JSON.stringify(
        deals.map((deal) => [deal.productId, deal.currentPrice]).sort(),
      ),
    );
    const { data: claimed, error: claimError } = await db().rpc(
      "claim_deal_delivery",
      { p_alert_id: alert.id, p_fingerprint: fingerprint },
    );
    if (claimError) {
      failed++;
      continue;
    }
    if (!claimed) continue;
    const unsubscribeUrl = `${baseUrl()}/api/reminders/unsubscribe?token=${reminder.unsubscribe_token}`;
    try {
      await sendEmail({
        to: alert.email,
        subject: "GearFit: a saved item has a lower catalog price",
        key: `deal-${alert.id}-${fingerprint}`,
        text: `Catalog prices for your kit have dropped:\n${deals.map((deal) => `${deal.name}: $${deal.currentPrice.toFixed(2)} (saved at $${deal.savedPrice.toFixed(2)})`).join("\n")}\n\nThese are catalog estimates, not a merchant offer. Confirm the current retailer price.\nView saved kit: ${baseUrl()}/k/${alert.kit_slug}\n\nUnsubscribe: ${unsubscribeUrl}`,
        unsubscribeUrl,
      });
      const { error: markError } = await db()
        .from("deal_alert_deliveries")
        .update({ sent_at: new Date().toISOString() })
        .eq("alert_id", alert.id)
        .eq("fingerprint", fingerprint);
      if (markError) throw new Error("Delivery acknowledgement unavailable");
      sent++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}

type Deal = Awaited<ReturnType<typeof findDeals>>[number];
type DemoReason =
  | "no_enabled_alert"
  | "no_confirmed_reminder"
  | "no_active_pro"
  | "no_price_drop"
  | "delivery_failed";

/** A deliberate rehearsal gets new delivery rows; real price fingerprints are untouched. */
export async function demoDealAlerts(kitSlug: string): Promise<{
  sent: number;
  failed: number;
  deals: Deal[];
  reasons: DemoReason[];
}> {
  const client = db();
  const { data: kit, error: kitError } = await client
    .from("kits")
    .select("id,items")
    .eq("slug", kitSlug)
    .maybeSingle();
  if (kitError) throw new ApiError(503, "Kit lookup unavailable");
  if (!kit) throw new ApiError(404, "Kit not found");
  const { data: alerts, error: alertError } = await client
    .from("pro_deal_alerts")
    .select("id,email,checkout_id")
    .eq("kit_slug", kitSlug)
    .eq("enabled", true)
    .order("id")
    .limit(10);
  if (alertError) throw new ApiError(503, "Deal alerts unavailable");
  if (!alerts?.length) {
    return { sent: 0, failed: 0, deals: [], reasons: ["no_enabled_alert"] };
  }

  const skipped = new Set<DemoReason>();
  const recipients: { alertId: string; email: string; unsubscribeToken: string }[] = [];
  for (const alert of alerts) {
    const { data: reminder, error: reminderError } = await client
      .from("reminders")
      .select("unsubscribe_token")
      .eq("email", alert.email)
      .eq("kit_id", kit.id)
      .not("confirmed_at", "is", null)
      .is("unsubscribed_at", null)
      .maybeSingle();
    if (reminderError) throw new ApiError(503, "Reminder lookup unavailable");
    if (!reminder) {
      skipped.add("no_confirmed_reminder");
      continue;
    }
    const { data: subscription, error: subscriptionError } = await client
      .from("subscriptions")
      .select("id")
      .eq("checkout_id", alert.checkout_id)
      .eq("status", "active")
      .gt("current_period_end", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (subscriptionError) throw new ApiError(503, "Subscription lookup unavailable");
    if (!subscription) {
      skipped.add("no_active_pro");
      continue;
    }
    recipients.push({ alertId: alert.id, email: alert.email, unsubscribeToken: reminder.unsubscribe_token });
  }
  if (!recipients.length) {
    return { sent: 0, failed: 0, deals: [], reasons: [...skipped] };
  }
  const deals = await findDeals(kit.items as CategoryResult[]);
  if (!deals.length) {
    return { sent: 0, failed: 0, deals: [], reasons: ["no_price_drop"] };
  }

  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    // A namespaced UUID is the demo delivery identity in the existing composite primary key.
    const fingerprint = `demo:${randomUUID()}`;
    const { error: insertError } = await client.from("deal_alert_deliveries").insert({
      alert_id: recipient.alertId,
      fingerprint,
    });
    if (insertError) {
      failed++;
      continue;
    }
    const unsubscribeUrl = `${baseUrl()}/api/reminders/unsubscribe?token=${recipient.unsubscribeToken}`;
    try {
      await sendEmail({
        to: recipient.email,
        subject: "GearFit demo: a saved item has a lower catalog price",
        key: `deal-${recipient.alertId}-${fingerprint}`,
        text: `DEMO — a repeatable rehearsal using real catalog price changes.\n\nCatalog prices for your kit have dropped:\n${deals.map((deal) => `${deal.name}: $${deal.currentPrice.toFixed(2)} (saved at $${deal.savedPrice.toFixed(2)})`).join("\n")}\n\nThese are catalog estimates, not a merchant offer. Confirm the current retailer price.\nView saved kit: ${baseUrl()}/k/${kitSlug}\n\nUnsubscribe: ${unsubscribeUrl}`,
        unsubscribeUrl,
      });
      const { error: markError } = await client
        .from("deal_alert_deliveries")
        .update({ sent_at: new Date().toISOString() })
        .eq("alert_id", recipient.alertId)
        .eq("fingerprint", fingerprint);
      if (markError) throw new Error("Delivery acknowledgement unavailable");
      sent++;
    } catch {
      failed++;
    }
    if (recipient !== recipients.at(-1)) {
      await new Promise((resolve) => setTimeout(resolve, 550));
    }
  }
  return { sent, failed, deals, reasons: sent ? [] : ["delivery_failed"] };
}
