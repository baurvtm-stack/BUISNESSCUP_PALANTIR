/**
 * Client-side kit actions shared by the kit page and "My kits": save (device first, then
 * cloud when /api/kits is live), get a cloud slug for reminders, and export a calendar.
 */
import { decodeAnswers } from "./answers";
import { saveKitToCloud } from "./api/client";
import type { KitItemSnapshot } from "./api/contract";
import { buildIcs } from "./ics";
import { goHref } from "./kit-url";
import { newKitId, savedKits, updateKit, upsertKit, type SavedKit } from "./saved-kits";

export interface KitDraft {
  token: string;
  choices: string[];
  tradeId: string;
  tradeLabel: string;
  items: KitItemSnapshot[];
  totals: { upfront: number; perMonth: number };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Saves on the device immediately; the cloud copy (and its short-link slug) follows if available. */
export async function saveKit(draft: KitDraft, existing?: SavedKit): Promise<SavedKit> {
  const kit: SavedKit = existing
    ? { ...existing, ...draft }
    : { ...draft, id: newKitId(), createdAt: new Date().toISOString(), boughtAt: today() };
  upsertKit(kit);
  const slug = await ensureCloudSlug(kit);
  return slug ? { ...kit, slug } : kit;
}

/** Returns the kit's cloud slug, creating the cloud copy if needed. Null when /api/kits is unavailable. */
export async function ensureCloudSlug(kit: SavedKit): Promise<string | null> {
  if (kit.slug) return kit.slug;
  const answers = decodeAnswers(kit.token);
  if (!answers) return null;
  const out = await saveKitToCloud({
    answers,
    token: kit.token,
    choices: kit.choices,
    tradeLabel: kit.tradeLabel,
    items: kit.items.map(({ category, label, productId, brand, name, price, lifespanMonths, costPerMonth }) => ({
      category,
      label,
      productId,
      brand,
      name,
      price,
      lifespanMonths,
      costPerMonth,
    })),
    totals: kit.totals,
  });
  if (out.kind !== "ok") return null;
  if (savedKits.get().some((k) => k.id === kit.id)) updateKit(kit.id, { slug: out.data.slug });
  return out.data.slug;
}

/** Downloads an .ics file with one "replace this" event per item, due when it wears out. */
export function downloadReminders(items: KitItemSnapshot[], from = new Date()) {
  const origin = window.location.origin;
  const ics = buildIcs(
    items.map((it) => ({
      title: `Replace: ${it.brand} ${it.name}`,
      description: `Your ${it.name} is due for replacement after about ${it.lifespanMonths} months of wear. Reorder: ${origin}${goHref(it.productId)}`,
      url: `${origin}${goHref(it.productId)}`,
      monthsFromNow: it.lifespanMonths,
    })),
    from,
  );
  const blob = new Blob([ics], { type: "text/calendar" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "gearfit-replacements.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** Shares a URL with the native share sheet, or copies it. Resolves to what happened. */
export async function shareUrl(url: string, title: string): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
