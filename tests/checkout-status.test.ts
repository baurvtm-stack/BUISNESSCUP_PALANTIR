import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/subscribe/route";

vi.mock("server-only", () => ({}));
const fake = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  retrieve: vi.fn(),
  subscription: vi.fn(),
}));
vi.mock("stripe", async (original) => {
  const real = await original<typeof import("stripe")>();
  return {
    ...real,
    default: class extends real.default {
      constructor() {
        super("sk_test_unit_testing");
        this.checkout.sessions.retrieve = fake.retrieve;
        this.subscriptions.retrieve = fake.subscription;
      }
    },
  };
});
vi.mock("@/lib/retention/core", async (original) => ({
  ...(await original<typeof import("@/lib/retention/core")>()),
  db: () => ({ from: fake.from, rpc: fake.rpc }),
}));
const checkoutId = "e1b73b6b-2802-46ec-a7f2-559e2b0f93bd";
const session = {
  id: "cs_test_123",
  mode: "subscription",
  status: "complete",
  livemode: false,
  metadata: { gearfit_checkout_id: checkoutId },
  subscription: "sub_test",
};
const subscription = {
  id: "sub_test",
  status: "active",
  livemode: false,
  customer: "cus_test",
  cancel_at_period_end: false,
  metadata: { gearfit_checkout_id: checkoutId },
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
const get = (id = session.id) =>
  GET(
    new Request(
      `https://gearfit.test/api/subscribe?session_id=${encodeURIComponent(id)}`,
    ),
  );

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit_testing");
  fake.rpc.mockReset().mockResolvedValue({ error: null });
  fake.retrieve.mockReset().mockResolvedValue(session);
  fake.subscription.mockReset().mockResolvedValue(subscription);
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({
        data: { id: checkoutId, email: "worker@example.com" },
        error: null,
      }),
  };
  fake.from.mockReset().mockReturnValue(query);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/subscribe", () => {
  it.each(["active", "trialing"])(
    "verifies %s with Stripe and persists activation without a webhook",
    async (status) => {
      fake.subscription.mockResolvedValue({ ...subscription, status });
      const response = await get();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        active: true,
        email: "worker@example.com",
      });
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(fake.retrieve).toHaveBeenCalledWith("cs_test_123");
      expect(fake.subscription).toHaveBeenCalledWith("sub_test");
      expect(fake.from.mock.results[0].value.eq).toHaveBeenCalledWith(
        "stripe_session_id",
        session.id,
      );
      expect(fake.rpc).toHaveBeenCalledWith(
        "apply_stripe_subscription",
        expect.objectContaining({
          p_event_id: "checkout:cs_test_123",
          p_checkout_id: checkoutId,
          p_email: "worker@example.com",
          p_subscription_id: "sub_test",
          p_status: status,
        }),
      );
    },
  );
  it.each(["open", "expired"])("keeps %s checkout inactive", async (status) => {
    fake.retrieve.mockResolvedValue({ ...session, status });
    const response = await get();
    expect(await response.json()).toEqual({
      active: false,
      email: "worker@example.com",
    });
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.subscription).not.toHaveBeenCalled();
  });
  it.each(["canceled", "past_due", "incomplete", "unpaid"])(
    "does not activate a %s subscription",
    async (status) => {
      fake.subscription.mockResolvedValue({ ...subscription, status });
      expect(await (await get()).json()).toEqual({
        active: false,
        email: "worker@example.com",
      });
      expect(fake.rpc).not.toHaveBeenCalled();
    },
  );
  it.each(["", "cs_live_123", "../session"])(
    "rejects invalid session id %s before provider access",
    async (id) => {
      expect((await get(id)).status).toBe(400);
      expect(fake.retrieve).not.toHaveBeenCalled();
    },
  );
  it.each([
    { metadata: {} },
    { metadata: { gearfit_checkout_id: "fake" } },
    { livemode: true },
    { mode: "payment" },
  ])("rejects foreign sessions: %j", async (override) => {
    fake.retrieve.mockResolvedValue({ ...session, ...override });
    expect((await get()).status).toBe(404);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("rejects a session without a matching server checkout", async () => {
    fake.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    });
    expect((await get()).status).toBe(404);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("rejects a subscription bound to a different checkout", async () => {
    fake.subscription.mockResolvedValue({
      ...subscription,
      metadata: { gearfit_checkout_id: "other" },
    });
    expect((await get()).status).toBe(404);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("does not report success if activation could not be persisted", async () => {
    fake.rpc.mockResolvedValue({
      error: { message: "private provider details" },
    });
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private provider details");
  });
});
