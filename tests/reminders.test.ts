import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ db: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@/lib/retention/core", async (original) => ({
  ...(await original<typeof import("@/lib/retention/core")>()),
  db: mocks.db,
  rateLimit: mocks.rateLimit,
}));
import {
  confirmationForm,
  confirmReminder,
  EmailError,
  registerReminder,
  reminderSignupSchema,
  runReminders,
  sendEmail,
  tokenFromRequest,
  unsubscribeReminder,
} from "@/lib/retention/reminders";
import {
  GET as confirmGet,
  POST as confirmPost,
} from "@/app/api/reminders/confirm/route";
import {
  GET as unsubscribeGet,
  POST as unsubscribePost,
} from "@/app/api/reminders/unsubscribe/route";
import { POST as signupPost } from "@/app/api/reminders/route";
import { POST as demoPost } from "@/app/api/cron/reminders/route";

beforeEach(() => {
  mocks.rateLimit.mockReset().mockResolvedValue(undefined);
  mocks.db.mockReset();
  vi.stubEnv("APP_URL", "https://gearfit.example");
  vi.stubEnv("RESEND_API_KEY", "re_test_secret");
  vi.stubEnv("RESEND_FROM", "GearFit <reminders@gearfit.example>");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("reminder consent", () => {
  it("normalizes email and rejects invalid emails, slugs and unexpected fields", () => {
    expect(
      reminderSignupSchema.parse({
        email: " Worker@Example.COM ",
        kitSlug: "abc12345",
      }).email,
    ).toBe("worker@example.com");
    expect(
      reminderSignupSchema.safeParse({ email: "bad", kitSlug: "../kit" })
        .success,
    ).toBe(false);
    expect(
      reminderSignupSchema.safeParse({
        email: "a@b.com",
        kitSlug: "abc12345",
        confirmed: true,
      }).success,
    ).toBe(false);
  });
  it("does not confirm on a GET preview or interpolate arbitrary HTML", async () => {
    const token = "a".repeat(43);
    const parsed = tokenFromRequest(
      new Request(
        `https://gearfit.example/api/reminders/confirm?token=${token}`,
      ),
    );
    const form = confirmationForm(parsed!);
    expect(await form.text()).toContain('method="post"');
    expect(form.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(
      tokenFromRequest(
        new Request("https://gearfit.example/?token=%3Cscript%3E"),
      ),
    ).toBeNull();
  });
  it("returns failure for an expired confirmation", async () => {
    mocks.db.mockReturnValue({
      rpc: vi
        .fn()
        .mockResolvedValue({
          data: { status: "expired", slug: "KitSaved0001" },
          error: null,
        }),
    });
    expect(await confirmReminder("a".repeat(43))).toEqual({
      status: "expired",
      slug: "KitSaved0001",
    });
  });
  it("unsubscribes using the opaque token", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({
        data: { status: "unsubscribed", slug: "KitSaved0001" },
        error: null,
      });
    mocks.db.mockReturnValue({ rpc });
    await unsubscribeReminder("a".repeat(43));
    expect(rpc).toHaveBeenCalledWith("unsubscribe_reminder", {
      p_token: "a".repeat(43),
    });
  });
  it("does not send another confirmation to an active subscriber", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { id: "kit" }, error: null }),
    };
    mocks.db.mockReturnValue({
      from: () => chain,
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    });
    await registerReminder({
      email: "worker@example.com",
      kitSlug: "abc12345",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("reminder routes", () => {
  const token = "a".repeat(43);
  const slug = "KitSaved0001";
  const link = (action: string, method = "GET", value = token) =>
    new Request(
      `https://gearfit.example/api/reminders/${action}?token=${value}`,
      { method },
    );

  it("GET renders a mobile confirmation form without consuming the token", async () => {
    const rpc = vi.fn();
    mocks.db.mockReturnValue({ rpc });
    const response = await confirmGet(link("confirm"));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('name="viewport"');
    expect(html).toContain('method="post"');
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "reminder-confirm",
      60,
      3600,
    );
  });
  it.each(["confirmed", "expired", "invalid"])(
    "POST redirects %s confirmation to the frontend",
    async (status) => {
      mocks.db.mockReturnValue({
        rpc: vi
          .fn()
          .mockResolvedValue({
            data: { status, slug: status === "invalid" ? null : slug },
            error: null,
          }),
      });
      const response = await confirmPost(link("confirm", "POST"));
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        `https://gearfit.example/reminders?status=${status}${status === "invalid" ? "" : `&kit=${slug}`}`,
      );
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    },
  );
  it("redirects malformed confirmation tokens without querying consent", async () => {
    expect(
      (await confirmPost(link("confirm", "POST", "bad"))).headers.get(
        "location",
      ),
    ).toBe("https://gearfit.example/reminders?status=invalid");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("GET unsubscribe redirects; one-click POST still returns 200 JSON", async () => {
    mocks.db.mockReturnValue({
      rpc: vi
        .fn()
        .mockResolvedValue({
          data: { status: "unsubscribed", slug },
          error: null,
        }),
    });
    const response = await unsubscribeGet(link("unsubscribe"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `https://gearfit.example/reminders?status=unsubscribed&kit=${slug}`,
    );
    const oneClick = await unsubscribePost(link("unsubscribe", "POST"));
    expect(oneClick.status).toBe(200);
    expect(await oneClick.json()).toEqual({ status: "unsubscribed" });
    expect(mocks.rateLimit).toHaveBeenLastCalledWith(
      expect.any(Request),
      "reminder-unsubscribe",
      60,
      3600,
    );
  });
  it("redirects unknown unsubscribe tokens to invalid", async () => {
    mocks.db.mockReturnValue({
      rpc: vi
        .fn()
        .mockResolvedValue({
          data: { status: "invalid", slug: null },
          error: null,
        }),
    });
    const response = await unsubscribeGet(link("unsubscribe"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://gearfit.example/reminders?status=invalid",
    );
  });
  it("accepts the frontend signup and enforces 30/IP and 10/email hourly limits", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: async () => ({ data: { id: "kit" }, error: null }),
    };
    mocks.db.mockReturnValue({ from: () => query, rpc });
    const response = await signupPost(
      new Request("https://gearfit.example/api/reminders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "worker@example.com", kitSlug: slug }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "pending" });
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "reminders",
      30,
      3600,
    );
    expect(rpc).toHaveBeenCalledWith(
      "retention_rate_limit",
      expect.objectContaining({ p_limit: 10, p_window_seconds: 3600 }),
    );
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string).text,
    ).toContain(`/k/${slug}`);
  });
  it("sends every authorized demo with the item name, frontend kit link and a fresh idempotency key", async () => {
    vi.stubEnv("CRON_SECRET", "demo-only-secret");
    vi.stubEnv("REMINDER_TEST_MODE", "true");
    let sequence = 0;
    let pending = false;
    const rpc = vi.fn(async (name: string) => {
      if (name === "queue_demo_reminders") {
        sequence++;
        pending = true;
        return { data: 1, error: null };
      }
      if (!pending) return { data: [], error: null };
      pending = false;
      return {
        data: [
          {
            id: `demo-${sequence}`,
            reminder_id: "reminder",
            item_name: "Actual work boots",
            email: "worker@example.com",
            kit_slug: slug,
            unsubscribe_token: token,
            is_demo: true,
          },
        ],
        error: null,
      };
    });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: async () => ({
        data: { confirmed_at: "2026-11-14", unsubscribed_at: null },
        error: null,
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    };
    mocks.db.mockReturnValue({ rpc, from: () => chain });
    for (let i = 0; i < 2; i++) {
      const response = await demoPost(
        new Request("https://gearfit.example/api/cron/reminders", {
          method: "POST",
          headers: {
            authorization: "Bearer demo-only-secret",
            "content-type": "application/json",
          },
          body: JSON.stringify({ kitSlug: slug }),
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ queued: 1, sent: 1, failed: 0 });
    }
    const requests = vi.mocked(fetch).mock.calls.map(([, init]) => init!);
    expect(
      requests.map(
        (init) => (init.headers as Record<string, string>)["Idempotency-Key"],
      ),
    ).toEqual(["reminder/demo-1", "reminder/demo-2"]);
    for (const init of requests) {
      const message = JSON.parse(init.body as string).text;
      expect(message).toContain("Actual work boots");
      expect(message).toContain(`https://gearfit.example/k/${slug}`);
      expect(message).not.toContain("/api/kits/");
    }
  });
});

describe("Resend delivery", () => {
  it("sends text with an idempotency key and one-click unsubscribe", async () => {
    await sendEmail({
      to: "worker@example.com",
      subject: "Replace",
      text: "Inspect",
      key: "reminder/123",
      unsubscribeUrl: "https://gearfit.example/unsubscribe?token=opaque",
    });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "reminder/123",
    );
    const body = JSON.parse(init?.body as string);
    expect(body.text).toBe("Inspect");
    expect(body.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
  });
  it("distinguishes definite rejections from ambiguous network failures", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("private provider details", { status: 429 }),
    );
    await expect(
      sendEmail({ to: "a@b.com", subject: "x", text: "x", key: "x" }),
    ).rejects.toMatchObject({
      definiteFailure: true,
      message: "Email provider unavailable",
    });
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network"));
    await expect(
      sendEmail({ to: "a@b.com", subject: "x", text: "x", key: "x" }),
    ).rejects.toBeInstanceOf(EmailError);
  });
  it("does not send if the subscriber unsubscribed after the claim", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ id: "job", reminder_id: "reminder" }],
        error: null,
      })
      .mockResolvedValue({ data: [], error: null });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({
          data: { confirmed_at: "2026-11-14", unsubscribed_at: "2026-11-14" },
          error: null,
        }),
    };
    mocks.db.mockReturnValue({ rpc, from: () => chain });
    expect(await runReminders()).toEqual({ sent: 0, failed: 0, queued: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps demo claims separate from real due items", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: 1, error: null })
      .mockResolvedValue({ data: [], error: null });
    mocks.db.mockReturnValue({ rpc });
    expect(await runReminders("abc12345")).toEqual({
      sent: 0,
      failed: 0,
      queued: 1,
    });
    expect(rpc).toHaveBeenCalledWith("claim_reminder_delivery", {
      p_demo: true,
      p_slug: "abc12345",
    });
  });
  it("never marks a rejected send as sent", async () => {
    const delivery = {
      id: "job",
      reminder_id: "reminder",
      item_name: "Boots",
      email: "worker@example.com",
      kit_slug: "abc12345",
      unsubscribe_token: "a".repeat(43),
      is_demo: false,
    };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [delivery], error: null })
      .mockResolvedValue({ data: [], error: null });
    const update = vi
      .fn()
      .mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({
          data: { confirmed_at: "2026-11-14", unsubscribed_at: null },
          error: null,
        }),
      update,
    };
    mocks.db.mockReturnValue({ rpc, from: () => chain });
    vi.mocked(fetch).mockResolvedValueOnce(new Response("no", { status: 429 }));
    expect(await runReminders()).toEqual({ sent: 0, failed: 1, queued: 0 });
    expect(update).toHaveBeenCalledWith({
      last_error: "email_provider_failure",
      first_attempt_at: null,
    });
  });
});
