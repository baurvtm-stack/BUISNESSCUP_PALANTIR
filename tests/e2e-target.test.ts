import { describe, expect, it, vi } from "vitest";
import { selectE2ETarget } from "../scripts/e2e-target.mjs";

const sha = "a".repeat(40);
const repository = "team/gearfit";
const deployment = "https://vercel.com/team/gearfit/deploy123";
const preview = "https://gearfit-preview.vercel.app";
const input = { repository, sha, pullNumber: 9, token: "github-test-token", bypassSecret: "preview-test-token" };

function fixture({ state = "success", commentURL = deployment, previewURL = preview, healthStatus = 200,
  healthBody = {}, head = sha, commenter = "vercel[bot]" } = {}) {
  return vi.fn<typeof fetch>(async url => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/status")) return Response.json({ statuses: [{ context: "Vercel", state, target_url: deployment }] });
    if (path.endsWith("/pulls/9")) return Response.json({ number: 9, state: "open", head: { sha: head, repo: { full_name: repository } } });
    if (path.endsWith("/comments")) return Response.json([{ user: { login: commenter }, body: `| [Ready](${commentURL}) | [Preview](${previewURL}) |` }]);
    if (path === "/api/stats") return Response.json(healthBody, { status: healthStatus });
    throw new Error(`Unexpected test request: ${path}`);
  });
}

describe("CI preview selection", () => {
  it("uses the ready preview for this exact commit and scopes each credential to its host", async () => {
    const fetcher = fixture();
    expect(await selectE2ETarget(input, fetcher)).toMatchObject({ baseURL: preview });
    for (const [url, options] of fetcher.mock.calls) {
      const headers = new Headers(options?.headers);
      if (new URL(String(url)).hostname === "api.github.com") {
        expect(headers.get("Authorization")).toBe("Bearer github-test-token");
        expect(headers.has("x-vercel-protection-bypass")).toBe(false);
      } else {
        expect(headers.has("Authorization")).toBe(false);
        expect(headers.get("x-vercel-protection-bypass")).toBe("preview-test-token");
        expect(options?.redirect).toBe("manual");
      }
    }
  });

  it.each([
    { state: "pending" }, { commentURL: `${deployment}-old` }, { head: "b".repeat(40) },
    { commenter: "someone-else" }, { previewURL: "https://vercel.app.attacker.example" },
    { previewURL: "https://user:password@gearfit.vercel.app" },
    { healthStatus: 401 }, { healthStatus: 302 },
    { healthStatus: 503, healthBody: { error: "Service is not configured" } },
  ])("uses local for an unavailable, stale or untrusted preview: %j", async options => {
    const fetcher = fixture(options);
    expect((await selectE2ETarget(input, fetcher)).baseURL).toBe("");
  });

  it("keeps a configured but failing preview as the target so tests report the regression", async () => {
    expect((await selectE2ETarget(input, fixture({ healthStatus: 503, healthBody: { error: "Metrics unavailable" } }))).baseURL).toBe(preview);
  });

  it("uses local when preview discovery cannot reach GitHub", async () => {
    expect((await selectE2ETarget(input, vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")))).baseURL).toBe("");
  });
});
