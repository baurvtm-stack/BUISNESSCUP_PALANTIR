/**
 * Kits, Pro status and the shopper's email, kept on the device. Works with no backend;
 * when /api/kits is live a saved kit also gets a cloud slug for short links and reminders.
 */
import type { KitItemSnapshot } from "./api/contract";
import { createLocalStore } from "./local-store";
import { proAccessTokenSchema } from "@/lib/retention/validation";

/** Free plan keeps this many kits; Pro is unlimited. */
export const FREE_KIT_LIMIT = 3;

export interface SavedItem extends KitItemSnapshot {
  /** ISO date the shopper last replaced this item (wear tracker). */
  replacedAt?: string;
}

export interface SavedKit {
  id: string;
  /** Cloud slug from POST /api/kits, when the backend is available. */
  slug?: string;
  token: string;
  choices: string[];
  tradeId: string;
  tradeLabel: string;
  createdAt: string;
  /** ISO date (YYYY-MM-DD) the gear was bought; drives the wear tracker. */
  boughtAt: string;
  totals: { upfront: number; perMonth: number };
  items: SavedItem[];
  reminderEmail?: string;
  /** The reminder email this device saw confirmed (the emailed link, or the API saying so). */
  reminderConfirmed?: string;
}

/** What the reminder card shows for a saved kit: a confirmation seen on this device beats "check your inbox". */
export function reminderState(activeEmail?: string, confirmedEmail?: string): "idle" | "pending" | "confirmed" {
  if (!activeEmail) return "idle";
  return confirmedEmail === activeEmail ? "confirmed" : "pending";
}

/**
 * The links in reminder emails land on /reminders with the kit's slug. Record the result on
 * this device, so the kit page stops asking the shopper to check their inbox once they have
 * confirmed, and stops saying reminders are on once they have unsubscribed.
 */
export function recordReminderLink(kits: SavedKit[], slug: string, status: string): SavedKit[] {
  if (status === "confirmed") {
    return kits.map((k) => (k.slug === slug && k.reminderEmail ? { ...k, reminderConfirmed: k.reminderEmail } : k));
  }
  if (status === "unsubscribed") {
    return kits.map((k) => (k.slug === slug ? { ...k, reminderEmail: undefined, reminderConfirmed: undefined } : k));
  }
  return kits;
}

function isSavedKit(v: unknown): v is SavedKit {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.token === "string" &&
    typeof o.tradeLabel === "string" &&
    typeof o.createdAt === "string" &&
    Array.isArray(o.items) &&
    Array.isArray(o.choices) &&
    !!o.totals &&
    typeof o.totals === "object"
  );
}

export const savedKits = createLocalStore<SavedKit[]>("gearfit.kits.v1", [], (raw) =>
  Array.isArray(raw) ? raw.filter(isSavedKit).map((k) => ({ ...k, boughtAt: k.boughtAt ?? k.createdAt.slice(0, 10) })) : [],
);

export function kitKey(token: string, choices: string[]): string {
  return `${token}|${choices.join(",")}`;
}

export function findSavedKit(kits: SavedKit[], token: string, choices: string[]): SavedKit | undefined {
  const key = kitKey(token, choices);
  return kits.find((k) => kitKey(k.token, k.choices) === key);
}

export function newKitId(): string {
  return `kit_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function upsertKit(kit: SavedKit) {
  savedKits.set((prev) => {
    const i = prev.findIndex((k) => k.id === kit.id);
    if (i === -1) return [kit, ...prev];
    const next = [...prev];
    next[i] = kit;
    return next;
  });
}

export function updateKit(id: string, patch: Partial<SavedKit> | ((k: SavedKit) => Partial<SavedKit>)) {
  savedKits.set((prev) => prev.map((k) => (k.id === id ? { ...k, ...(typeof patch === "function" ? patch(k) : patch) } : k)));
}

export function removeKit(id: string) {
  savedKits.set((prev) => prev.filter((k) => k.id !== id));
}

// ---------- Pro ----------

export interface ProState {
  email: string;
  activatedAt: string;
  /** "stripe" after a confirmed checkout; "demo" when NEXT_PUBLIC_API_MOCKS simulated it. */
  source: "stripe" | "demo";
}

export const proStore = createLocalStore<ProState | null>("gearfit.pro.v1", null, (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return typeof o.email === "string" && typeof o.activatedAt === "string"
    ? { email: o.email, activatedAt: o.activatedAt, source: o.source === "demo" ? "demo" : "stripe" }
    : null;
});

/** Checkout capability belongs only on this device, separate from shareable kit data. */
export const proAccessStore = createLocalStore<string | null>("gearfit.pro-access.v1", null, (raw) => {
  const parsed = proAccessTokenSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
});

/** The shopper's email, remembered to prefill reminder and checkout forms. */
export const emailStore = createLocalStore<string>("gearfit.email.v1", "", (raw) => (typeof raw === "string" ? raw : ""));
