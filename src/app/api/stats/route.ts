import { ApiError, db, handle, json } from "@/lib/retention/core";

export const runtime = "nodejs";
export async function GET() {
  return handle(async () => {
    const { data, error } = await db().rpc("retention_stats");
    if (error) throw new ApiError(503, "Metrics unavailable");
    return json(data);
  });
}
