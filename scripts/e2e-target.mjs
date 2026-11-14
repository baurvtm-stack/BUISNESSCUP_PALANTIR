import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const inputSchema = z.object({
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  sha: z.string().regex(/^[a-f0-9]{40}$/),
  pullNumber: z.coerce.number().int().positive().optional(),
  token: z.string().optional(),
  bypassSecret: z.string().optional(),
});
const local = reason => ({ baseURL: "", reason });

/** This repo's Vercel integration publishes commit statuses and a bot PR comment,
 * not GitHub Deployment objects. Bind the comment's Ready link to this SHA's
 * successful status; never guess a branch URL or use an old PR deployment. */
export async function selectE2ETarget(input, fetcher = fetch) {
  const { repository, sha, pullNumber, token, bypassSecret } = inputSchema.parse(input);
  async function github(path) {
    const response = await fetcher(`https://api.github.com/repos/${repository}${path}`, {
      headers: {
        Accept: "application/vnd.github+json", "User-Agent": "GearFit-e2e",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("GitHub preview metadata is unavailable");
    return response.json();
  }
  try {
    const statuses = z.object({ statuses: z.array(z.object({
      context: z.string(), state: z.string(), target_url: z.string().nullable(),
    })) }).parse(await github(`/commits/${sha}/status`)).statuses;
    const status = statuses.find(value => value.context === "Vercel");
    if (status?.state !== "success" || !status.target_url) return local("No ready Vercel preview for this commit");
    const pulls = pullNumber ? [await github(`/pulls/${pullNumber}`)] : await github(`/commits/${sha}/pulls`);
    const pull = z.array(z.object({
      number: z.number().int(), state: z.string(),
      head: z.object({ sha: z.string(), repo: z.object({ full_name: z.string() }).nullable() }),
    })).parse(pulls).find(value => value.state === "open" && value.head.sha === sha && value.head.repo?.full_name === repository);
    if (!pull) return local("No open same-repository PR at this exact commit");
    const comments = z.array(z.object({
      user: z.object({ login: z.string() }), body: z.string(),
    })).parse(await github(`/issues/${pull.number}/comments?per_page=100`));
    const row = comments.filter(comment => comment.user.login === "vercel[bot]")
      .flatMap(comment => comment.body.split("\n"))
      .find(line => line.includes(`[Ready](${status.target_url})`));
    const link = row?.match(/\[Preview\]\((https:\/\/[^)]+)\)/)?.[1];
    if (!link) return local("Vercel's preview comment does not match this deployment");
    const url = new URL(link);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".vercel.app") ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      return local("Preview URL is not an HTTPS Vercel origin");
    }
    const health = await fetcher(`${url.origin}/api/stats`, {
      headers: bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : {},
      redirect: "manual", signal: AbortSignal.timeout(15_000),
    });
    if ([301, 302, 303, 307, 308, 401, 403].includes(health.status)) {
      return local("Preview is protected or redirects to authentication");
    }
    if (health.status === 503) {
      const body = await health.json().catch(() => null);
      if (body?.error === "Service is not configured") {
        return local("Preview has no Supabase configuration for cloud saves and stats");
      }
    }
    // An available deployment with a broken API must fail E2E, not quietly fall
    // back to local. Only missing deployment/access/configuration selects local.
    return { baseURL: url.origin, reason: "Ready Vercel preview for this commit" };
  } catch {
    return local("Preview metadata or network is unavailable");
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const target = await selectE2ETarget({
    repository: process.env.GITHUB_REPOSITORY,
    sha: process.env.E2E_COMMIT_SHA,
    pullNumber: process.env.E2E_PR_NUMBER || undefined,
    token: process.env.GITHUB_TOKEN,
    bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  });
  process.stdout.write(`E2E target: ${target.baseURL || "local production build"}. ${target.reason}.\n`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `base_url=${target.baseURL}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### Playwright target\n\n${target.baseURL || "Local production build with disposable PostgreSQL/PostgREST"}\n\n${target.reason}.\n`);
}
