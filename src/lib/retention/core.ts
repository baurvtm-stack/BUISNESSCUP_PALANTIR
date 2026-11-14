import { createHash, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string, public retryAfter = 3600) { super(message); }
}
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new ApiError(503, "Service is not configured");
  return value;
}
export function db() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function baseUrl() {
  const url = new URL(env("APP_URL"));
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new ApiError(503, "Service is not configured");
  }
  return url.origin;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export async function handle(action: () => Promise<Response>): Promise<Response> {
  try { return await action(); }
  catch (error) {
    if (error instanceof ApiError) {
      const response = json({ error: error.message }, error.status);
      if (error.status === 429) response.headers.set("Retry-After", String(error.retryAfter));
      return response;
    }
    if (error instanceof z.ZodError) return json({ error: "Invalid input", fields: error.issues.map(i => i.path.join(".")) }, 400);
    // Never serialize provider errors, request bodies, addresses, or tokens into logs.
    return json({ error: "Service temporarily unavailable" }, 503);
  }
}
export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.output<T>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ApiError(415, "Content-Type must be application/json");
  const max = 131072;
  if (Number(request.headers.get("content-length")) > max) throw new ApiError(413, "Body too large");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Body must be JSON");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > max) { await reader.cancel(); throw new ApiError(413, "Body too large"); }
    chunks.push(value);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ApiError(400, "Body must be JSON"); }
  return schema.parse(body);
}
export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
export function requireBearer(request: Request, envName: string) {
  const expected = hashToken(`Bearer ${env(envName)}`);
  const actual = hashToken(request.headers.get("authorization") ?? "");
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) throw new ApiError(401, "Unauthorized");
}
export async function rateLimit(request: Request, scope: string, limit = 20, windowSeconds = 3600) {
  // Vercel overwrites this header. Ignore client-supplied x-forwarded-for.
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "unknown" : "local";
  const key = createHmac("sha256", env("RATE_LIMIT_SECRET")).update(`${scope}:${ip}`).digest("hex");
  const { data, error } = await db().rpc("retention_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) throw new ApiError(503, "Rate limiter unavailable");
  if (data !== true) throw new ApiError(429, "Rate limit reached; try again later", windowSeconds);
}
