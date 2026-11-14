import { randomBytes } from "node:crypto";
import {
  ApiError,
  db,
  handle,
  json,
  rateLimit,
  readJson,
} from "@/lib/retention/core";
import { kitSnapshot, saveKitSchema } from "@/lib/retention/kits";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(async () => {
    await rateLimit(request, "kits", 200);
    const snapshot = await kitSnapshot(await readJson(request, saveKitSchema));
    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = randomBytes(9).toString("base64url");
      const { data, error } = await db()
        .from("kits")
        .insert({ slug, ...snapshot })
        .select("slug,created_at")
        .single();
      if (error?.code === "23505") continue;
      if (error) throw new ApiError(503, "Could not save kit");
      return json({ slug: data.slug, createdAt: data.created_at }, 201);
    }
    throw new ApiError(503, "Could not allocate kit link; try again");
  });
}
