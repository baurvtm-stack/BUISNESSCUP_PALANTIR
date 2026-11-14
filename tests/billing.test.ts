import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import type { CategoryResult } from "@/lib/types";
import { PRODUCTS } from "@/data/products";

vi.mock("server-only", () => ({}));

const fake = vi.hoisted(() => ({
  rows: [] as unknown[],
  rpc: vi.fn(),
  from: vi.fn(),
  gt: vi.fn(),
}));
vi.mock("@/lib/retention/core", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/retention/core")>();
  return {
    ...real,
    db: () => ({ from: fake.from, rpc: fake.rpc }),
    rateLimit: vi.fn().mockResolvedValue(undefined),
  };
});
import * as billing from "@/lib/retention/billing";
import {
  emailSchema,
  findDeals,
  processStripeEvent,
  resolvePro,
  stripeClient,
} from "@/lib/retention/billing";
import { POST as webhook } from "@/app/api/stripe/webhook/route";
import { POST as subscribe } from "@/app/api/subscribe/route";

beforeEach(() => {
  fake.rows = [];
  fake.rpc.mockReset().mockResolvedValue({ error: null });
  fake.from.mockReset();
  fake.gt.mockReset();
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    gt: fake.gt,
    limit: vi.fn(),
    maybeSingle: vi.fn(async () => fake.rows.shift()),
  };
  for (const method of [chain.select, chain.eq, chain.gt, chain.limit])
    method.mockReturnValue(chain);
  fake.from.mockReturnValue(chain);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit_testing");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_unit_testing");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function subscription(status = "active") {
  return {
    id: "sub_test",
    livemode: false,
    status,
    customer: "cus_test",
    cancel_at_period_end: false,
    metadata: { gearfit_checkout_id: "e1b73b6b-2802-46ec-a7f2-559e2b0f93bd" },
    items: {
      data: [
        {
          quantity: 1,
          current_period_end: 1900000000,
          price: {
            unit_amount: 400,
            currency: "usd",
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
  };
}
function event(type = "customer.subscription.updated", status = "active") {
  return {
    id: "evt_test",
    type,
    created: 1700000000,
    livemode: false,
    data: { object: subscription(status) },
  } as unknown as Stripe.Event;
}

describe("billing security and state", () => {
  it("creates only a $4 monthly USD test checkout and returns a separate secret capability", async () => {
    vi.stubEnv("APP_URL", "https://gearfit.test");
    const insert = vi.fn().mockResolvedValue({ error: null });
    fake.from.mockReturnValue({
      insert,
      update: () => ({ eq: async () => ({ error: null }) }),
    });
    const create = vi
      .fn()
      .mockResolvedValue({
        id: "cs_test_123",
        url: "https://checkout.stripe.com/test",
      });
    vi.spyOn(billing, "stripeClient").mockReturnValue({
      checkout: { sessions: { create } },
    } as unknown as Stripe);
    const response = await subscribe(
      new Request("https://gearfit.test/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "worker@example.com" }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      url: "https://checkout.stripe.com/test",
      accessToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      testMode: true,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        allowed_payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: expect.objectContaining({
              unit_amount: 400,
              currency: "usd",
              recurring: { interval: "month" },
            }),
          },
        ],
        success_url:
          "https://gearfit.test/pro?status=success&session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://gearfit.test/pro?status=cancel",
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(insert.mock.calls[0][0].token_hash).not.toBe(body.accessToken);
  });
  it("normalizes addresses and rejects invalid input", () => {
    expect(emailSchema.parse("  Worker@Example.com ")).toBe(
      "worker@example.com",
    );
    expect(emailSchema.safeParse("not an email").success).toBe(false);
  });
  it("refuses live keys", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_never_use");
    expect(() => stripeClient()).toThrow("Stripe test mode is required");
  });
  it("does not trust an email or malformed capability as proof of Pro", async () => {
    expect(
      await resolvePro(
        new Request("https://gearfit.test/api/pro?email=paid@example.com"),
      ),
    ).toBeNull();
    expect(
      await resolvePro(
        new Request("https://gearfit.test", {
          headers: { Authorization: "Bearer fake" },
        }),
      ),
    ).toBeNull();
    expect(fake.from).not.toHaveBeenCalled();
  });
  it("requires active subscription for the exact checkout and an unexpired paid period", async () => {
    fake.rows.push(
      {
        data: { id: "own-checkout", email: "worker@example.com" },
        error: null,
      },
      { data: null, error: null },
    );
    const request = new Request("https://gearfit.test", {
      headers: { Authorization: `Bearer ${"a".repeat(43)}` },
    });
    expect(await resolvePro(request)).toBeNull();
    expect(fake.gt).toHaveBeenCalledWith(
      "current_period_end",
      expect.any(String),
    );
  });
  it("uses current Stripe state rather than replayed event state and persists atomically", async () => {
    fake.rows.push({
      data: { id: "checkout", email: "worker@example.com" },
      error: null,
    });
    const retrieve = vi.fn().mockResolvedValue(subscription("canceled"));
    await processStripeEvent(event(), {
      subscriptions: { retrieve },
    } as unknown as Stripe);
    expect(retrieve).toHaveBeenCalledWith("sub_test");
    expect(fake.rpc).toHaveBeenCalledWith(
      "apply_stripe_subscription",
      expect.objectContaining({
        p_status: "canceled",
        p_email: "worker@example.com",
        p_event_id: "evt_test",
      }),
    );
  });
  it("rejects live events and a tampered plan", async () => {
    const stripe = {
      subscriptions: {
        retrieve: vi
          .fn()
          .mockResolvedValue({ ...subscription(), items: { data: [] } }),
      },
    } as unknown as Stripe;
    await expect(
      processStripeEvent({ ...event(), livemode: true }, stripe),
    ).rejects.toThrow("Live Stripe events");
    await expect(processStripeEvent(event(), stripe)).rejects.toThrow(
      "Unexpected subscription plan",
    );
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("leaves failed persistence retryable instead of acknowledging the webhook", async () => {
    fake.rows.push({
      data: { id: "checkout", email: "worker@example.com" },
      error: null,
    });
    fake.rpc.mockResolvedValue({ error: { message: "database failure" } });
    await expect(
      processStripeEvent(event(), {
        subscriptions: { retrieve: vi.fn().mockResolvedValue(subscription()) },
      } as unknown as Stripe),
    ).rejects.toThrow("Subscription update unavailable");
  });
  it("verifies raw-body signatures and acknowledges unrelated signed test events", async () => {
    const payload = JSON.stringify({
      id: "evt_ignored",
      type: "payment_intent.created",
      livemode: false,
      data: { object: {} },
    });
    const signature = stripeClient().webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_unit_testing",
    });
    const valid = await webhook(
      new Request("https://gearfit.test/api/stripe/webhook", {
        method: "POST",
        body: payload,
        headers: { "stripe-signature": signature },
      }),
    );
    expect(valid.status).toBe(200);
    const tampered = await webhook(
      new Request("https://gearfit.test/api/stripe/webhook", {
        method: "POST",
        body: payload + " ",
        headers: { "stripe-signature": signature },
      }),
    );
    expect(tampered.status).toBe(400);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("only produces deal alerts for lower current catalog prices", () => {
    const product = PRODUCTS[0];
    const snapshot = (price: number) =>
      ({ pick: { product: { ...product, price } } }) as CategoryResult;
    expect(findDeals([snapshot(product.price)])).toEqual([]);
    expect(findDeals([snapshot(product.price + 10)])).toEqual([
      expect.objectContaining({
        productId: product.id,
        currentPrice: product.price,
        savedPrice: product.price + 10,
      }),
    ]);
  });
});
