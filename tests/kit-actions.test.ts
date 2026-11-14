import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAnswers, DEFAULT_ANSWERS } from "@/lib/answers";
import { saveCloudKit, saveKit, type KitDraft } from "@/lib/kit-actions";
import { savedKits } from "@/lib/saved-kits";

const draft: KitDraft = {
  token: encodeAnswers(DEFAULT_ANSWERS), choices: [], tradeId: "electrician", tradeLabel: "Electrician",
  items: [], totals: { upfront: 0, perMonth: 0 },
};
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: vi.fn() } });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockImplementation(async () => Response.json({ slug: "CloudOnly001" }, { status: 201 }));
  savedKits.set(Array.from({ length: 3 }, (_, i) => ({
    ...draft, id: `kit-${i}`, createdAt: "2026-11-14", boughtAt: "2026-11-14",
  })));
});
afterEach(() => vi.unstubAllGlobals());

describe("cloud-only reminder kit", () => {
  it("creates the cloud link without changing the three device saves", async () => {
    const before = structuredClone(savedKits.get());
    expect(await saveCloudKit(draft)).toBe("CloudOnly001");
    expect(savedKits.get()).toEqual(before);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/kits");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).answers.trade).toBe("electrician");
  });

  it("does not add a local kit if the cloud request fails", async () => {
    fetchMock.mockRejectedValue(new Error("Offline"));
    expect(await saveCloudKit(draft)).toBeNull();
    expect(savedKits.get()).toHaveLength(3);
  });

  it("retains device-first saving below the free limit", async () => {
    savedKits.set([]);
    const saved = await saveKit(draft);
    expect(savedKits.get()).toHaveLength(1);
    expect(savedKits.get()[0]).toMatchObject({ id: saved.id, slug: "CloudOnly001" });
  });
});
