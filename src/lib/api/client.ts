/**
 * Typed client for the GearFit API with graceful fallbacks.
 *
 * Every call resolves to an ApiOutcome instead of throwing:
 *  - "ok":          the endpoint answered with JSON.
 *  - "unavailable": the endpoint is missing (HTML 404/405), down (5xx), slow or offline.
 *                   Callers fall back (save on device, calendar file, direct retailer link…).
 *  - "rejected":    the endpoint answered with a JSON 4xx (bad email, rate limit, not found).
 *                   Callers show the message.
 *
 * Set NEXT_PUBLIC_API_MOCKS=1 to simulate unavailable endpoints for local demos only.
 */
import { z } from "zod";
import { kitSlugSchema, proAccessTokenSchema } from "@/lib/retention/validation";
import { parseAnswers } from "../answers";
import type { Answers } from "../types";
import type {
  ClickRequest,
  DealAlertSettings,
  DealAlertStatus,
  KitItemSnapshot,
  RecommendResponse,
  ReminderRequest,
  ReminderResponse,
  SaveKitRequest,
  SaveKitResponse,
  ServerProStatus,
  Stats,
  StoredKit,
  SubscribeRequest,
  SubscribeResponse,
  SubscriptionStatus,
} from "./contract";

export type ApiOutcome<T> =
  | { kind: "ok"; data: T }
  | { kind: "unavailable"; reason: string }
  | { kind: "rejected"; status: number; message: string };

export const MOCKS_ENABLED = process.env.NEXT_PUBLIC_API_MOCKS === "1";

type Json = Record<string, unknown>;

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  accessToken?: string;
}

export async function request(path: string, opts: RequestOptions = {}): Promise<ApiOutcome<Json>> {
  const { method = "GET", body, timeoutMs = 8000, signal, accessToken } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(path, {
      method,
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
    const data: unknown = isJson ? await res.json().catch(() => null) : null;
    const obj = data && typeof data === "object" && !Array.isArray(data) ? (data as Json) : null;
    // A missing route answers with Next's HTML 404 page; a crash answers 5xx. Both mean "not available yet".
    if (!isJson || res.status >= 500) return { kind: "unavailable", reason: `${method} ${path} → ${res.status}` };
    if (res.ok) {
      return obj ? { kind: "ok", data: obj } : { kind: "unavailable", reason: `${method} ${path} → unexpected body` };
    }
    const message = str(obj, "error", "message") ?? `Request failed (${res.status})`;
    return { kind: "rejected", status: res.status, message };
  } catch (e) {
    return { kind: "unavailable", reason: e instanceof Error ? e.message : "Network error" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// ---------- tolerant readers (accept camelCase and snake_case, nested { data } envelopes) ----------

function unwrap(o: Json, ...keys: string[]): Json {
  for (const k of keys) {
    const v = o[k];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Json;
  }
  return o;
}

function str(o: Json | null | undefined, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function num(o: Json | null | undefined, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = Number(o?.[k]);
    if (o?.[k] !== undefined && o?.[k] !== null && Number.isFinite(v)) return v;
  }
  return undefined;
}

export function isSafeUrl(url: string): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function mockId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------- endpoints ----------

/** POST /api/recommend (live in the MVP). */
export async function fetchRecommendation(answers: Answers, signal?: AbortSignal): Promise<ApiOutcome<RecommendResponse>> {
  const out = await request("/api/recommend", { method: "POST", body: answers, signal, timeoutMs: 10000 });
  if (out.kind !== "ok") return out;
  const token = str(out.data, "token");
  const kit = out.data.kit as RecommendResponse["kit"] | undefined;
  if (!token || !kit || !Array.isArray(kit.items)) return { kind: "unavailable", reason: "Unexpected /api/recommend body" };
  return { kind: "ok", data: { token, kit } };
}

/** POST /api/kits */
export async function saveKitToCloud(req: SaveKitRequest): Promise<ApiOutcome<SaveKitResponse>> {
  const out = await request("/api/kits", { method: "POST", body: req });
  if (out.kind === "ok") {
    const d = unwrap(out.data, "kit", "data");
    const slug = str(d, "slug", "id") ?? str(out.data, "slug", "id");
    return slug ? { kind: "ok", data: { slug } } : { kind: "unavailable", reason: "No slug in /api/kits response" };
  }
  if (out.kind === "unavailable" && MOCKS_ENABLED) return { kind: "ok", data: { slug: mockId("demo") } };
  return out;
}

function isSnapshot(v: unknown): v is KitItemSnapshot {
  if (!v || typeof v !== "object") return false;
  const o = v as Json;
  return typeof o.productId === "string" && typeof o.category === "string";
}

/** GET /api/kits/[slug] */
export async function getKitFromCloud(slug: string): Promise<ApiOutcome<StoredKit>> {
  const out = await request(`/api/kits/${encodeURIComponent(slug)}`);
  if (out.kind !== "ok") return out;
  const d = unwrap(out.data, "kit", "data");
  const answers = parseAnswers(d.answers);
  if (!answers) return { kind: "rejected", status: 422, message: "This kit link is out of date." };
  const rawItems = Array.isArray(d.items) ? d.items : [];
  return {
    kind: "ok",
    data: {
      slug: str(d, "slug", "id") ?? slug,
      answers,
      items: rawItems.filter(isSnapshot),
      createdAt: str(d, "createdAt", "created_at"),
    },
  };
}

/**
 * POST /api/click. Resolves to the URL to send the shopper to: the API's affiliate URL when
 * available, otherwise the fallback. Never rejects, never blocks longer than ~2.5s.
 */
export async function resolveClick(req: ClickRequest, fallbackUrl: string | null): Promise<{ url: string | null; tracked: boolean }> {
  const out = await request("/api/click", { method: "POST", body: req, timeoutMs: 2500 });
  if (out.kind === "ok") {
    const url = str(out.data, "url", "redirectUrl", "redirect_url", "location", "href");
    return { url: url && isSafeUrl(url) ? url : fallbackUrl, tracked: out.data.tracked !== false };
  }
  return { url: fallbackUrl, tracked: false };
}

/** POST /api/reminders */
export async function subscribeReminders(req: ReminderRequest): Promise<ApiOutcome<ReminderResponse>> {
  const out = await request("/api/reminders", { method: "POST", body: req });
  if (out.kind === "ok") {
    const status = str(out.data, "status")?.toLowerCase();
    return { kind: "ok", data: { status: status === "confirmed" || status === "active" ? "confirmed" : "pending" } };
  }
  if (out.kind === "unavailable" && MOCKS_ENABLED) return { kind: "ok", data: { status: "pending" } };
  return out;
}

/** POST /api/subscribe → Stripe Checkout URL. */
export async function startCheckout(req: SubscribeRequest): Promise<ApiOutcome<SubscribeResponse>> {
  const out = await request("/api/subscribe", { method: "POST", body: req });
  if (out.kind === "ok") {
    const url = str(out.data, "url", "checkoutUrl", "checkout_url", "sessionUrl");
    const token = proAccessTokenSchema.optional().safeParse(out.data.accessToken);
    if (!token.success) return { kind: "unavailable", reason: "Invalid Pro access token in checkout response" };
    return url && isSafeUrl(url)
      ? { kind: "ok", data: { url, ...(token.data ? { accessToken: token.data } : {}) } }
      : { kind: "unavailable", reason: "No checkout URL in /api/subscribe response" };
  }
  if (out.kind === "unavailable" && MOCKS_ENABLED) {
    return { kind: "ok", data: { url: `/pro?status=success&session_id=${mockId("mock")}` } };
  }
  return out;
}

/** GET /api/subscribe?session_id=… */
export async function getCheckoutStatus(sessionId: string, timeoutMs = 8000): Promise<ApiOutcome<SubscriptionStatus>> {
  const out = await request(`/api/subscribe?session_id=${encodeURIComponent(sessionId)}`, { timeoutMs });
  if (out.kind !== "ok") return out;
  const d = unwrap(out.data, "subscription", "data");
  const status = str(d, "status")?.toLowerCase();
  const active =
    d.active === true || d.pro === true || d.isPro === true || ["active", "trialing", "paid", "complete"].includes(status ?? "");
  return { kind: "ok", data: { active, email: str(d, "email") } };
}

/** Allow a pending checkout to settle, with a twenty-second budget including request timeouts. */
export async function confirmCheckout(sessionId: string): Promise<ApiOutcome<SubscriptionStatus>> {
  const deadline = Date.now() + 20000;
  let out = await getCheckoutStatus(sessionId, 8000);
  for (const delay of [1000, 3000, 5000]) {
    if (out.kind === "rejected" || (out.kind === "ok" && out.data.active)) return out;
    if (deadline - Date.now() <= delay) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    out = await getCheckoutStatus(sessionId, Math.min(8000, remaining));
  }
  return out;
}

const serverProSchema = z.object({ pro: z.boolean(), features: z.array(z.string()) });
const dealSettingsSchema = z.object({ enabled: z.boolean() });
const dealRequestSchema = dealSettingsSchema.extend({ kitSlug: kitSlugSchema }).strict();
const dealStatusSchema = dealSettingsSchema.extend({
  source: z.literal("catalog_estimates"),
  deals: z.array(z.object({
    productId: z.string().min(1),
    name: z.string(),
    savedPrice: z.number().finite().nonnegative(),
    currentPrice: z.number().finite().nonnegative(),
  })),
});

const inactivePro = (): ApiOutcome<never> => ({
  kind: "rejected", status: 403, message: "Pro isn't active on the server yet. Refresh in a minute.",
});

/** Capability stays in the Authorization header, never in paths, JSON bodies or logs. */
export async function getServerPro(accessToken: string): Promise<ApiOutcome<ServerProStatus>> {
  if (!proAccessTokenSchema.safeParse(accessToken).success) return inactivePro();
  const out = await request("/api/pro", { accessToken });
  if (out.kind !== "ok") return out;
  const parsed = serverProSchema.safeParse(out.data);
  return parsed.success
    ? { kind: "ok", data: parsed.data }
    : { kind: "unavailable", reason: "Unexpected /api/pro body" };
}

export async function getDealAlerts(kitSlug: string, accessToken: string): Promise<ApiOutcome<DealAlertStatus>> {
  if (!proAccessTokenSchema.safeParse(accessToken).success) return inactivePro();
  if (!kitSlugSchema.safeParse(kitSlug).success) return { kind: "rejected", status: 400, message: "Save this kit first." };
  const out = await request(`/api/pro/deals?kitSlug=${encodeURIComponent(kitSlug)}`, { accessToken });
  if (out.kind !== "ok") return out;
  const parsed = dealStatusSchema.safeParse(out.data);
  return parsed.success
    ? { kind: "ok", data: parsed.data }
    : { kind: "unavailable", reason: "Unexpected /api/pro/deals body" };
}

export async function setDealAlerts(
  input: { kitSlug: string; enabled: boolean },
  accessToken: string,
): Promise<ApiOutcome<DealAlertSettings>> {
  if (!proAccessTokenSchema.safeParse(accessToken).success) return inactivePro();
  const parsed = dealRequestSchema.safeParse(input);
  if (!parsed.success) return { kind: "rejected", status: 400, message: "Save this kit first." };
  const out = await request("/api/pro/deals", { method: "POST", body: parsed.data, accessToken });
  if (out.kind !== "ok") return out;
  const settings = dealSettingsSchema.safeParse(out.data);
  return settings.success
    ? { kind: "ok", data: settings.data }
    : { kind: "unavailable", reason: "Unexpected /api/pro/deals body" };
}

/** Shopper-facing messages shared by the switch's load and save paths. */
export function dealAlertProblem(out: Exclude<ApiOutcome<unknown>, { kind: "ok" }>) {
  if (out.kind === "unavailable") {
    return { needsReminder: false, message: "Deal alerts are temporarily unavailable. Please try again." };
  }
  if (out.status === 409) {
    return { needsReminder: true, message: "Confirm replacement reminders for this kit with your Pro email first." };
  }
  if (out.status === 403) {
    return { needsReminder: false, message: "Pro isn't active on the server yet. Refresh in a minute." };
  }
  return { needsReminder: false, message: out.message };
}

/** GET /api/stats. Returns null when stats are not available. */
export async function getStats(): Promise<Stats | null> {
  const out = await request("/api/stats", { timeoutMs: 4000 });
  if (out.kind !== "ok") return null;
  const d = unwrap(out.data, "stats", "data");
  const kitsCreated = num(d, "kitsCreated", "kits_created", "kits");
  if (kitsCreated === undefined) return null;
  return {
    kitsCreated,
    clicks: num(d, "clicks", "affiliateClicks", "affiliate_clicks") ?? 0,
    reminderSignups: num(d, "reminderSignups", "reminder_signups", "reminders") ?? 0,
    proSubscribers: num(d, "proConversions", "pro_conversions", "proSubscribers", "pro_subscribers", "pro") ?? 0,
  };
}
