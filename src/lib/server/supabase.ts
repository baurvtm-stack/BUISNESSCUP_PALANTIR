import "server-only";
import { z } from "zod";

const configurationSchema = z.object({
  url: z.string().url().refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash &&
      (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
  }),
  key: z.string().trim().min(20).max(4096),
});

export type SupabaseConfiguration = z.infer<typeof configurationSchema>;

export class DataUnavailableError extends Error {
  constructor() {
    super("Catalog or click storage is unavailable");
    this.name = "DataUnavailableError";
  }
}

/** Missing credentials intentionally select local JSON; invalid credentials fail closed. */
export function getSupabaseConfiguration(): SupabaseConfiguration | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  const result = configurationSchema.safeParse({ url, key });
  if (!result.success) throw new DataUnavailableError();
  return result.data;
}

export async function supabaseRequest(
  config: SupabaseConfiguration,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("apikey", config.key);
  // New sb_secret keys are API keys, not bearer JWTs. Legacy service-role keys are JWTs.
  if (!config.key.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${config.key}`);
  headers.set("Content-Type", "application/json");
  try {
    const response = await fetch(`${config.url.replace(/\/$/, "")}/rest/v1/${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new DataUnavailableError();
    return response;
  } catch {
    // Never leak credentials, backend response bodies, or connection details to clients/logs.
    throw new DataUnavailableError();
  }
}
