import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmCheckout, dealAlertProblem, getDealAlerts, getServerPro, setDealAlerts, startCheckout } from "@/lib/api/client";

const token = "a".repeat(43);
const slug = "DealSaved001";
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Checkout confirmation retries", () => {
  beforeEach(() => vi.useFakeTimers());

  it("retries unavailable then returns the verified active subscription", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ active: true, email: "pro@example.com" }));
    const result = confirmCheckout("cs_test_pending");
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ kind: "ok", data: { active: true, email: "pro@example.com" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns unavailable after bounded retries without inventing an activation", async () => {
    fetchMock.mockImplementation(async () => Response.json({ error: "Unavailable" }, { status: 503 }));
    const start = Date.now();
    const result = confirmCheckout("cs_test_pending");
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ kind: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(Date.now() - start).toBe(9000);
  });

  it("returns a rejection immediately without retrying", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "Checkout not found" }, { status: 404 }));
    expect(await confirmCheckout("cs_test_unknown")).toMatchObject({ kind: "rejected", status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries a valid but still inactive checkout", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ active: false }))
      .mockResolvedValueOnce(Response.json({ active: true }));
    const result = confirmCheckout("cs_test_pending");
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ kind: "ok", data: { active: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("includes stalled requests in the total ten-second budget", async () => {
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("Timed out")));
    }));
    const start = Date.now();
    const result = confirmCheckout("cs_test_pending");
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ kind: "unavailable" });
    expect(Date.now() - start).toBe(10000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("Pro capability and deal client", () => {
  it("keeps the Checkout access token without placing it in the redirect URL", async () => {
    const url = "https://checkout.stripe.com/c/pay/cs_test_example";
    fetchMock.mockResolvedValue(Response.json({ url, accessToken: token, testMode: true }));
    const out = await startCheckout({ email: "pro@example.com" });
    expect(out).toEqual({ kind: "ok", data: { url, accessToken: token } });
    expect(url).not.toContain(token);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(token);
  });
  it("rejects a malformed access token in a Checkout response", async () => {
    fetchMock.mockResolvedValue(Response.json({ url: "https://checkout.stripe.com/c/pay/test", accessToken: "bad" }));
    expect(await startCheckout({ email: "pro@example.com" })).toMatchObject({ kind: "unavailable" });
  });
  it("checks server Pro with the capability in Authorization only", async () => {
    fetchMock.mockResolvedValue(Response.json({ pro: true, features: ["deal_alerts"] }));
    expect(await getServerPro(token)).toEqual({ kind: "ok", data: { pro: true, features: ["deal_alerts"] } });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/pro");
    expect(init.headers.Authorization).toBe(`Bearer ${token}`);
    expect(init.body).toBeUndefined();
  });
  it("loads saved alert settings using only the kit slug in the URL", async () => {
    fetchMock.mockResolvedValue(Response.json({ enabled: true, deals: [], source: "catalog_estimates" }));
    expect(await getDealAlerts(slug, token)).toMatchObject({ kind: "ok", data: { enabled: true } });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe(`/api/pro/deals?kitSlug=${slug}`);
    expect(path).not.toContain(token);
    expect(init.headers.Authorization).toBe(`Bearer ${token}`);
  });
  it.each([true, false])("sends enabled=%s and trusts the successful server setting", async (enabled) => {
    fetchMock.mockResolvedValue(Response.json({ enabled }));
    expect(await setDealAlerts({ kitSlug: slug, enabled }, token)).toEqual({ kind: "ok", data: { enabled } });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/pro/deals");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${token}`);
    expect(JSON.parse(init.body)).toEqual({ kitSlug: slug, enabled });
    expect(init.body).not.toContain(token);
  });
  it.each([
    [403, false, "Pro isn't active on the server yet. Refresh in a minute."],
    [409, true, "Confirm replacement reminders for this kit with your Pro email first."],
    [503, false, "Deal alerts are temporarily unavailable. Please try again."],
  ] as const)("maps HTTP %s to the switch's actionable message", async (status, needsReminder, message) => {
    fetchMock.mockResolvedValue(Response.json({ error: "Provider response" }, { status }));
    const out = await setDealAlerts({ kitSlug: slug, enabled: true }, token);
    expect(out.kind).not.toBe("ok");
    if (out.kind === "ok") throw new Error("Unexpected success");
    expect(dealAlertProblem(out)).toEqual({ needsReminder, message });
  });
  it("maps network errors to temporary unavailability, without claiming the switch is on", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const out = await setDealAlerts({ kitSlug: slug, enabled: true }, token);
    expect(out.kind).toBe("unavailable");
    if (out.kind === "ok") throw new Error("Unexpected success");
    expect(dealAlertProblem(out)).toEqual({ needsReminder: false, message: "Deal alerts are temporarily unavailable. Please try again." });
  });
  it("does not interpret malformed successful JSON as an enabled alert", async () => {
    fetchMock.mockResolvedValue(Response.json({ enabled: "true" }));
    expect(await setDealAlerts({ kitSlug: slug, enabled: true }, token)).toMatchObject({ kind: "unavailable" });
  });
  it("rejects invalid capabilities and kit slugs before sending a request", async () => {
    expect(await getServerPro("invalid")).toMatchObject({ kind: "rejected", status: 403 });
    expect(await setDealAlerts({ kitSlug: "../bad", enabled: true }, token)).toMatchObject({ kind: "rejected", status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("persists the capability separately from kits and rejects corrupt stored tokens", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } });
    vi.resetModules();
    const { proAccessStore } = await import("@/lib/saved-kits");
    proAccessStore.set(token);
    expect(storage.get("gearfit.pro-access.v1")).toBe(JSON.stringify(token));
    expect(storage.has("gearfit.kits.v1")).toBe(false);
    vi.resetModules();
    expect((await import("@/lib/saved-kits")).proAccessStore.get()).toBe(token);
    storage.set("gearfit.pro-access.v1", JSON.stringify("invalid"));
    vi.resetModules();
    expect((await import("@/lib/saved-kits")).proAccessStore.get()).toBeNull();
  });
});
