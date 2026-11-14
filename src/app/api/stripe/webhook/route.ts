import { ApiError, env, handle, json } from "@/lib/retention/core";
import { processStripeEvent, stripeClient } from "@/lib/retention/billing";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(async () => {
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new ApiError(400, "Missing Stripe signature");
    if (Number(request.headers.get("content-length") ?? 0) > 262144)
      throw new ApiError(413, "Payload too large");
    const body = await request.text();
    if (Buffer.byteLength(body) > 262144)
      throw new ApiError(413, "Payload too large");
    const stripe = stripeClient();
    const secret = env("STRIPE_WEBHOOK_SECRET");
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret);
    } catch {
      throw new ApiError(400, "Invalid Stripe signature");
    }
    await processStripeEvent(event, stripe);
    return json({ received: true });
  });
}
