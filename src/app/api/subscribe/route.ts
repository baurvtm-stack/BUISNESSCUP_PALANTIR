import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, baseUrl, db, handle, hashToken, json, randomToken, rateLimit, readJson } from "../../../lib/retention/core";
import { emailSchema, stripeClient } from "../../../lib/retention/billing";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimit(request, "subscribe", 5);
    const { email } = await readJson(request, z.object({ email: emailSchema }).strict());
    const stripe = stripeClient();
    const accessToken = randomToken();
    const checkoutId = randomUUID();
    const { error } = await db().from("pro_checkouts").insert({ id: checkoutId, email, token_hash: hashToken(accessToken) });
    if (error) throw new ApiError(503, "Checkout unavailable");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", allowed_payment_method_types: ["card"], customer_email: email,
      client_reference_id: checkoutId, metadata: { gearfit_checkout_id: checkoutId },
      subscription_data: { metadata: { gearfit_checkout_id: checkoutId } },
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 400,
        recurring: { interval: "month" }, product_data: { name: "GearFit Pro", description: "Unlimited saved kits, wear tracking and deal alerts — TEST MODE" } } }],
      success_url: `${baseUrl()}/?pro=success`, cancel_url: `${baseUrl()}/?pro=canceled`,
    }, { idempotencyKey: `gearfit-checkout-${checkoutId}` });
    if (!session.url) throw new ApiError(503, "Checkout unavailable");
    const { error: updateError } = await db().from("pro_checkouts").update({ stripe_session_id: session.id }).eq("id", checkoutId);
    if (updateError) throw new ApiError(503, "Checkout unavailable");
    return json({ url: session.url, accessToken, testMode: true }, 201);
  });
}
