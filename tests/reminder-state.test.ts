import { describe, expect, it } from "vitest";
import { recordReminderLink, reminderState, type SavedKit } from "@/lib/saved-kits";

const kit = (over: Partial<SavedKit>): SavedKit => ({
  id: "kit-1", slug: "Reminder0001", token: "token", choices: [], tradeId: "electrician", tradeLabel: "Electrician",
  createdAt: "2026-11-15", boughtAt: "2026-11-15", totals: { upfront: 0, perMonth: 0 }, items: [], ...over,
});

describe("reminder card state on this device", () => {
  it("asks to check the inbox until this device sees the same email confirmed", () => {
    expect(reminderState()).toBe("idle");
    expect(reminderState("pro@example.com")).toBe("pending");
    expect(reminderState("pro@example.com", "earlier@example.com")).toBe("pending");
    expect(reminderState("pro@example.com", "pro@example.com")).toBe("confirmed");
  });

  it("records a confirmed link for the kit with that slug only", () => {
    const kits = [kit({ reminderEmail: "pro@example.com" }), kit({ id: "kit-2", slug: "Other0000001", reminderEmail: "a@example.com" })];
    const next = recordReminderLink(kits, "Reminder0001", "confirmed");
    expect(next[0].reminderConfirmed).toBe("pro@example.com");
    expect(next[1].reminderConfirmed).toBeUndefined();
    expect(reminderState(next[0].reminderEmail, next[0].reminderConfirmed)).toBe("confirmed");
  });

  it("does not invent an email for a kit that never asked for reminders", () => {
    const [only] = recordReminderLink([kit({})], "Reminder0001", "confirmed");
    expect(only.reminderConfirmed).toBeUndefined();
    expect(reminderState(only.reminderEmail, only.reminderConfirmed)).toBe("idle");
  });

  it("forgets the reminder email after an unsubscribe, and ignores other link results", () => {
    const kits = [kit({ reminderEmail: "pro@example.com", reminderConfirmed: "pro@example.com" })];
    const [unsubscribed] = recordReminderLink(kits, "Reminder0001", "unsubscribed");
    expect(reminderState(unsubscribed.reminderEmail, unsubscribed.reminderConfirmed)).toBe("idle");
    expect(recordReminderLink(kits, "Reminder0001", "expired")).toEqual(kits);
    expect(recordReminderLink(kits, "Reminder0001", "invalid")).toEqual(kits);
  });
});
