import Stripe from "stripe";
import { z } from "zod";
import { ApiError, baseUrl, db, env, hashToken } from "./core";
import { PRODUCTS } from "../../data/products";
import type { CategoryResult } from "../types";
import { sendEmail } from "./reminders";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const kitSlugSchema = z.string().regex(/^[A-Za-z0-9_-]{6,32}$/);

export function stripeClient() {
  const key = env("STRIPE_SECRET_KEY");
  if (!key.startsWith("sk_test_")) throw new ApiError(503, "Stripe test mode is required");
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 10000 });
}

export function isPro(status: string) { return status === "active"; }

export async function resolvePro(request: Request): Promise<{ email: string; checkoutId: string } | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) return null;
  const { data: checkout, error } = await db().from("pro_checkouts")
    .select("id,email").eq("token_hash", hashToken(token)).maybeSingle();
  if (error) throw new ApiError(503, "Subscription lookup unavailable");
  if (!checkout) return null;
  const { data: subscription, error: subscriptionError } = await db().from("subscriptions")
    .select("status").eq("checkout_id", checkout.id).eq("status", "active")
    .gt("current_period_end", new Date().toISOString()).limit(1).maybeSingle();
  if (subscriptionError) throw new ApiError(503, "Subscription lookup unavailable");
  return subscription ? { email: checkout.email, checkoutId: checkout.id } : null;
}

export async function requirePro(request: Request) {
  const pro = await resolvePro(request);
  if (!pro) throw new ApiError(403, "An active Pro access token is required");
  return pro;
}

export async function processStripeEvent(event: Stripe.Event, stripe: Stripe) {
  if (event.livemode) throw new ApiError(400, "Live Stripe events are not supported");
  let subscriptionId: string | undefined;
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== "subscription") return;
    subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    subscriptionId = (event.data.object as Stripe.Subscription).id;
  } else return;
  if (!subscriptionId) return;
  // Fetch current state: webhook delivery order is not guaranteed.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const checkoutId = subscription.metadata.gearfit_checkout_id;
  if (!checkoutId || subscription.livemode) return;
  const price = subscription.items.data[0]?.price;
  if (subscription.items.data.length !== 1 || price?.unit_amount !== 400 || price.currency !== "usd" ||
      price.recurring?.interval !== "month" || price.recurring.interval_count !== 1 || subscription.items.data[0]?.quantity !== 1) {
    throw new ApiError(400, "Unexpected subscription plan");
  }
  const { data: checkout, error } = await db().from("pro_checkouts").select("id,email")
    .eq("id", checkoutId).maybeSingle();
  if (error) throw new ApiError(503, "Subscription lookup unavailable");
  if (!checkout) throw new ApiError(503, "Checkout binding is not ready");
  const { error: saveError } = await db().rpc("apply_stripe_subscription", {
    p_event_id: event.id, p_event_created: event.created, p_subscription_id: subscription.id,
    p_checkout_id: checkoutId, p_email: checkout.email, p_status: subscription.status,
    p_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    p_cancel_at_period_end: subscription.cancel_at_period_end,
    p_current_period_end: new Date(subscription.items.data[0].current_period_end * 1000).toISOString(),
  });
  if (saveError) throw new ApiError(503, "Subscription update unavailable");
}

export function findDeals(items: CategoryResult[]) {
  return items.flatMap(item => {
    const current = PRODUCTS.find(product => product.id === item.pick.product.id);
    return current && current.price < item.pick.product.price
      ? [{ productId: current.id, name: current.name, savedPrice: item.pick.product.price, currentPrice: current.price }]
      : [];
  });
}

/** Catalog price drops only: no invented discounts or promotional mail without double opt-in. */
export async function dispatchDealAlerts(): Promise<{ sent: number; failed: number }> {
  const { data: alerts, error } = await db().from("pro_deal_alerts").select("id,email,kit_slug,checkout_id")
    .eq("enabled", true).order("last_checked_at", { ascending: true }).limit(10);
  if (error) throw new ApiError(503, "Deal alerts unavailable");
  let sent = 0; let failed = 0;
  const deadline = Date.now() + 15000;
  for (const alert of alerts ?? []) {
    if (Date.now() > deadline) break;
    const { error: checkedError } = await db().from("pro_deal_alerts").update({ last_checked_at: new Date().toISOString() }).eq("id", alert.id);
    if (checkedError) { failed++; continue; }
    const { data: subscription, error: subError } = await db().from("subscriptions").select("id")
      .eq("checkout_id", alert.checkout_id).eq("status", "active")
      .gt("current_period_end", new Date().toISOString()).limit(1).maybeSingle();
    if (subError) { failed++; continue; }
    if (!subscription) continue;
    const { data: kit, error: kitError } = await db().from("kits").select("id,items").eq("slug", alert.kit_slug).maybeSingle();
    if (kitError) { failed++; continue; }
    if (!kit) continue;
    const { data: reminder, error: reminderError } = await db().from("reminders").select("id,unsubscribe_token")
      .eq("email", alert.email).eq("kit_id", kit.id).not("confirmed_at", "is", null).is("unsubscribed_at", null).maybeSingle();
    if (reminderError) { failed++; continue; }
    if (!reminder) continue;
    const deals = findDeals(kit.items as CategoryResult[]);
    if (!deals.length) continue;
    const fingerprint = hashToken(JSON.stringify(deals.map(deal => [deal.productId, deal.currentPrice]).sort()));
    const { data: claimed, error: claimError } = await db().rpc("claim_deal_delivery", { p_alert_id: alert.id, p_fingerprint: fingerprint });
    if (claimError) { failed++; continue; }
    if (!claimed) continue;
    const unsubscribeUrl = `${baseUrl()}/api/reminders/unsubscribe?token=${reminder.unsubscribe_token}`;
    try {
      await sendEmail({ to: alert.email, subject: "GearFit: a saved item has a lower catalog price", key: `deal-${alert.id}-${fingerprint}`,
        text: `Catalog prices for your kit have dropped:\n${deals.map(deal => `${deal.name}: $${deal.currentPrice.toFixed(2)} (saved at $${deal.savedPrice.toFixed(2)})`).join("\n")}\n\nThese are catalog estimates, not a merchant offer. Confirm the current retailer price.\nView saved kit: ${baseUrl()}/api/kits/${alert.kit_slug}\n\nUnsubscribe: ${unsubscribeUrl}`, unsubscribeUrl });
      const { error: markError } = await db().from("deal_alert_deliveries").update({ sent_at: new Date().toISOString() })
        .eq("alert_id", alert.id).eq("fingerprint", fingerprint);
      if (markError) throw new Error("Delivery acknowledgement unavailable");
      sent++;
    } catch { failed++; }
  }
  return { sent, failed };
}
