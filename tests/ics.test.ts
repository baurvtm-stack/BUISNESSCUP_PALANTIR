import { describe, expect, it } from "vitest";
import { buildIcs } from "../src/lib/ics";
import { PRODUCTS, buyUrl } from "../src/data/products";

describe("tracked retailer links in exported reminders", () => {
  it("resolves app-relative tracking URLs in both the calendar URL and reorder description", () => {
    const url = buyUrl(PRODUCTS[0]);
    const calendar = buildIcs([{ title: "Replace boots", description: `Reorder: ${url}`, url, monthsFromNow: 12 }],
      new Date("2026-11-14T07:00:00Z"), "https://gearfit.example");
    expect(calendar).toContain(`URL:https://gearfit.example${url}\r\n`);
    expect(calendar).toContain(`DESCRIPTION:Reorder: https://gearfit.example${url}\r\n`);
    expect(calendar).not.toContain("URL:/api/");
  });

  it("preserves absolute retailer links for existing callers", () => {
    const calendar = buildIcs([{ title: "Replace", description: "Inspect first", url: "https://retailer.example/boot", monthsFromNow: 2 }]);
    expect(calendar).toContain("URL:https://retailer.example/boot\r\n");
  });
});
