import { describe, expect, it } from "vitest";
import { coveredStandards } from "@/lib/standards";

describe("selected kit standards", () => {
  it("deduplicates supported standards in product order without mutating the input", () => {
    const products = [
      { standards: ["ASTM F2413 EH", "EN 388", "ANSI Z87.1+"] },
      { standards: ["ANSI Z87.1+", "NFPA 70E", "NRR 25 dB"] },
    ];
    const before = structuredClone(products);
    expect(coveredStandards(products)).toEqual(["ASTM F2413 EH", "ANSI Z87.1+", "NFPA 70E", "NRR 25 dB"]);
    expect(products).toEqual(before);
    expect(coveredStandards([])).toEqual([]);
  });

  it("removes the previous glove's cut and impact ratings after a swap", () => {
    const original = { standards: ["ANSI/ISEA 105 A5", "ANSI/ISEA 138"] };
    const replacement = { standards: ["ANSI/ISEA 105 A2"] };
    expect(coveredStandards([original])).toEqual(original.standards);
    expect(coveredStandards([replacement])).toEqual(["ANSI/ISEA 105 A2"]);
  });

  it("replaces the previous hard hat's type with the selected hat's rating", () => {
    const boots = { standards: ["ASTM F2413 EH"] };
    expect(coveredStandards([boots, { standards: ["ANSI Z89.1 Type II Class E"] }]))
      .toEqual(["ASTM F2413 EH", "ANSI Z89.1 Type II Class E"]);
  });
});
