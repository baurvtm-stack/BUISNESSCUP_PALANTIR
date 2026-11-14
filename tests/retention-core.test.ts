import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseUrl, db, rateLimit } from "@/lib/retention/core";

vi.mock("server-only", () => ({}));
const fake = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: fake.createClient }));
beforeEach(() => {
  fake.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  fake.createClient.mockReset().mockReturnValue({ rpc: fake.rpc });
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_preferred_example_key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy_example_service_key");
  vi.stubEnv("VERCEL", "1");
});
afterEach(() => vi.unstubAllEnvs());

describe("retention deployment configuration", () => {
  it("prefers the new Supabase key and supports the legacy fallback", () => {
    db();
    expect(fake.createClient).toHaveBeenLastCalledWith(
      "https://project.supabase.co",
      "sb_secret_preferred_example_key",
      expect.any(Object),
    );
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    db();
    expect(fake.createClient).toHaveBeenLastCalledWith(
      "https://project.supabase.co",
      "legacy_example_service_key",
      expect.any(Object),
    );
  });
  it("keeps the abuse limit working when RATE_LIMIT_SECRET is missing", async () => {
    vi.stubEnv("RATE_LIMIT_SECRET", "");
    const request = new Request("https://gearfit.test/api/kits", {
      headers: { "x-vercel-forwarded-for": "203.0.113.5" },
    });
    await rateLimit(request, "kits", 200);
    expect(fake.rpc).toHaveBeenCalledWith("retention_rate_limit", {
      p_key: createHash("sha256").update("kits:203.0.113.5").digest("hex"),
      p_limit: 200,
      p_window_seconds: 3600,
    });
  });
  it("uses a keyed hash when configured and ignores spoofed x-forwarded-for", async () => {
    vi.stubEnv("RATE_LIMIT_SECRET", "operator-supplied-secret");
    const request = new Request("https://gearfit.test/api/kits", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.5",
        "x-forwarded-for": "spoofed",
      },
    });
    await rateLimit(request, "kits", 200);
    expect(fake.rpc.mock.calls[0][1].p_key).toBe(
      createHmac("sha256", "operator-supplied-secret")
        .update("kits:203.0.113.5")
        .digest("hex"),
    );
  });
  it("uses the canonical Vercel production host if APP_URL is absent", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "gearfit.vercel.app");
    expect(baseUrl()).toBe("https://gearfit.vercel.app");
    vi.stubEnv("APP_URL", "https://gearfit.example/");
    expect(baseUrl()).toBe("https://gearfit.example");
  });
  it.each([
    "javascript:alert(1)",
    "http://public.example",
    "https://user:secret@example.com",
    "not a url",
  ])("rejects an unsafe APP_URL: %s", (url) => {
    vi.stubEnv("APP_URL", url);
    expect(() => baseUrl()).toThrow("Service is not configured");
  });
});
