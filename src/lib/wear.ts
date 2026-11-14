import { addMonths, monthsBetween } from "./format";

export type WearStatus = "good" | "soon" | "due";

export interface Wear {
  usedMonths: number;
  remainingMonths: number;
  /** Share of the lifespan used, 0–1. */
  pct: number;
  status: WearStatus;
  dueDate: Date;
}

/** How worn an item is, given its expected lifespan and when it went into service. */
export function wearOf(lifespanMonths: number, since: Date, now = new Date()): Wear {
  const life = Math.max(0.1, lifespanMonths);
  const used = Math.max(0, monthsBetween(since, now));
  const remaining = life - used;
  // "Soon" = inside the last 15% of its life, and never less than two weeks of warning.
  const soonWindow = Math.max(0.5, life * 0.15);
  return {
    usedMonths: used,
    remainingMonths: remaining,
    pct: Math.min(1, used / life),
    status: remaining <= 0 ? "due" : remaining <= soonWindow ? "soon" : "good",
    dueDate: addMonths(since, life),
  };
}

/** "Replace now", "Replace in ~2 weeks", "~5 months left". */
export function wearLabel(w: Wear): string {
  if (w.status === "due") return "Replace now";
  const m = w.remainingMonths;
  const left = m < 1 ? `${Math.max(1, Math.round(m * 4.35))} wk` : `${Math.round(m)} mo`;
  return w.status === "soon" ? `Replace in ~${left}` : `~${left} left`;
}
