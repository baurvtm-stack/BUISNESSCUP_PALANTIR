import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("../src/lib/retention/core", async (original) => ({
  ...await original<typeof import("../src/lib/retention/core")>(),
  db: mocks.db,
}));
import { confirmationForm, confirmReminder, EmailError, registerReminder, reminderSignupSchema, runReminders, sendEmail, tokenFromRequest, unsubscribeReminder } from "../src/lib/retention/reminders";

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://gearfit.example");
  vi.stubEnv("RESEND_API_KEY", "re_test_secret");
  vi.stubEnv("RESEND_FROM", "GearFit <reminders@gearfit.example>");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("reminder consent", () => {
  it("normalizes email and rejects invalid emails, slugs and unexpected fields", () => {
    expect(reminderSignupSchema.parse({ email: " Worker@Example.COM ", kitSlug: "abc12345" }).email).toBe("worker@example.com");
    expect(reminderSignupSchema.safeParse({ email: "bad", kitSlug: "../kit" }).success).toBe(false);
    expect(reminderSignupSchema.safeParse({ email: "a@b.com", kitSlug: "abc12345", confirmed: true }).success).toBe(false);
  });
  it("does not confirm on a GET preview or interpolate arbitrary HTML", async () => {
    const token = "a".repeat(43);
    const parsed = tokenFromRequest(new Request(`https://gearfit.example/api/reminders/confirm?token=${token}`));
    const form = confirmationForm(parsed);
    expect(await form.text()).toContain('method="post"');
    expect(form.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(() => tokenFromRequest(new Request("https://gearfit.example/?token=%3Cscript%3E"))).toThrow();
  });
  it("returns failure for an expired confirmation", async () => {
    mocks.db.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: false, error: null }) });
    await expect(confirmReminder("a".repeat(43))).rejects.toThrow("Invalid or expired");
  });
  it("unsubscribes using the opaque token", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.db.mockReturnValue({ rpc });
    await unsubscribeReminder("a".repeat(43));
    expect(rpc).toHaveBeenCalledWith("unsubscribe_reminder", { p_token: "a".repeat(43) });
  });
  it("does not send another confirmation to an active subscriber", async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "kit" }, error: null }) };
    mocks.db.mockReturnValue({ from: () => chain, rpc: vi.fn().mockResolvedValue({ data: false, error: null }) });
    await registerReminder({ email: "worker@example.com", kitSlug: "abc12345" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Resend delivery", () => {
  it("sends text with an idempotency key and one-click unsubscribe", async () => {
    await sendEmail({ to: "worker@example.com", subject: "Replace", text: "Inspect", key: "reminder/123", unsubscribeUrl: "https://gearfit.example/unsubscribe?token=opaque" });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe("reminder/123");
    const body = JSON.parse(init?.body as string);
    expect(body.text).toBe("Inspect");
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
  it("distinguishes definite rejections from ambiguous network failures", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("private provider details", { status: 429 }));
    await expect(sendEmail({ to: "a@b.com", subject: "x", text: "x", key: "x" })).rejects.toMatchObject({ definiteFailure: true, message: "Email provider unavailable" });
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network"));
    await expect(sendEmail({ to: "a@b.com", subject: "x", text: "x", key: "x" })).rejects.toBeInstanceOf(EmailError);
  });
  it("does not send if the subscriber unsubscribed after the claim", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [{ id: "job", reminder_id: "reminder" }], error: null }).mockResolvedValue({ data: [], error: null });
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { confirmed_at: "2026-11-14", unsubscribed_at: "2026-11-14" }, error: null }) };
    mocks.db.mockReturnValue({ rpc, from: () => chain });
    expect(await runReminders()).toEqual({ sent: 0, failed: 0, queued: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps demo claims separate from real due items", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: 1, error: null }).mockResolvedValue({ data: [], error: null });
    mocks.db.mockReturnValue({ rpc });
    expect(await runReminders("abc12345")).toEqual({ sent: 0, failed: 0, queued: 1 });
    expect(rpc).toHaveBeenCalledWith("claim_reminder_delivery", { p_demo: true, p_slug: "abc12345" });
  });
  it("never marks a rejected send as sent", async () => {
    const delivery = { id: "job", reminder_id: "reminder", item_name: "Boots", email: "worker@example.com", kit_slug: "abc12345", unsubscribe_token: "a".repeat(43), is_demo: false };
    const rpc = vi.fn().mockResolvedValueOnce({ data: [delivery], error: null }).mockResolvedValue({ data: [], error: null });
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { confirmed_at: "2026-11-14", unsubscribed_at: null }, error: null }), update };
    mocks.db.mockReturnValue({ rpc, from: () => chain });
    vi.mocked(fetch).mockResolvedValueOnce(new Response("no", { status: 429 }));
    expect(await runReminders()).toEqual({ sent: 0, failed: 1, queued: 0 });
    expect(update).toHaveBeenCalledWith({ last_error: "email_provider_failure", first_attempt_at: null });
  });
});
