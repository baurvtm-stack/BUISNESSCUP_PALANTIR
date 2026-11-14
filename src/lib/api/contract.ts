/**
 * The HTTP contract between the GearFit frontend and the API routes.
 * Human-readable version with examples: docs/api-contract.md.
 *
 * Routes are implemented; provider-backed features need their documented environment.
 * The adapters in ./client.ts retain graceful fallbacks when services are unavailable.
 */
import type { Answers, Category, KitResult } from "../types";

/** POST /api/recommend — body: Answers. */
export interface RecommendResponse {
  token: string;
  kit: KitResult;
}

/** One chosen product inside a saved kit. */
export interface KitItemSnapshot {
  category: Category;
  label: string;
  productId: string;
  brand: string;
  name: string;
  price: number;
  lifespanMonths: number;
  costPerMonth: number;
}

/** POST /api/kits — save a kit, no login. Response: SaveKitResponse. */
export interface SaveKitRequest {
  answers: Answers;
  /** Share token from /api/recommend (the answers, URL-encoded). */
  token: string;
  /** Chosen product id for each item position, in kit order. */
  choices: string[];
  tradeLabel: string;
  items: KitItemSnapshot[];
  totals: { upfront: number; perMonth: number };
}

export interface SaveKitResponse {
  slug: string;
}

/** GET /api/kits/[slug] */
export interface StoredKit {
  slug: string;
  answers: Answers;
  items: KitItemSnapshot[];
  createdAt?: string;
}

/** POST /api/click — log an outbound click and get the (affiliate-tagged) retailer URL. */
export interface ClickRequest {
  productId: string;
  /** Saved-kit slug or the kit's answers token ([A-Za-z0-9_-], up to 2000 chars). */
  kitId?: string;
}

export interface ClickResponse {
  redirectUrl: string;
  /** False when the click could not be stored (e.g. no database configured). */
  tracked: boolean;
}

/** POST /api/reminders — double opt-in replacement reminders by email. */
export interface ReminderRequest {
  email: string;
  kitSlug: string;
}

export interface ReminderResponse {
  /** "pending" until the person clicks the confirmation email. */
  status: "pending" | "confirmed";
}

/** POST /api/subscribe — start Stripe Checkout for Pro ($4/month). */
export interface SubscribeRequest {
  email: string;
}

export interface SubscribeResponse {
  /** Stripe Checkout URL. success_url must be /pro?status=success&session_id={CHECKOUT_SESSION_ID}. */
  url: string;
  /** Secret capability saved on this device before Checkout; never put it in a URL. */
  accessToken?: string;
}

export interface ServerProStatus {
  pro: boolean;
  features: string[];
}

export interface DealAlertSettings {
  enabled: boolean;
}

export interface CatalogDeal {
  productId: string;
  name: string;
  savedPrice: number;
  currentPrice: number;
}

export interface DealAlertStatus extends DealAlertSettings {
  deals: CatalogDeal[];
  source: "catalog_estimates";
}

/** GET /api/subscribe?session_id=cs_… — confirm a finished checkout. */
export interface SubscriptionStatus {
  active: boolean;
  email?: string;
}

/** GET /api/stats — counts for the pitch and for social proof. */
export interface Stats {
  kitsCreated: number;
  clicks: number;
  reminderSignups: number;
  proSubscribers: number;
}
