import { ApiError, db, handle, json } from "@/lib/retention/core";
import { kitItemSnapshots, slugSchema } from "@/lib/retention/kits";
import { answersSchema } from "@/lib/answers";

export const runtime = "nodejs";
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  return handle(async () => {
    const slug = slugSchema.parse((await context.params).slug);
    const { data, error } = await db()
      .from("kits")
      .select("id,slug,answers,items,created_at")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw new ApiError(503, "Could not load kit");
    if (!data) throw new ApiError(404, "Kit not found");
    return json({
      slug: data.slug,
      answers: answersSchema.parse(data.answers),
      items: kitItemSnapshots(data.items),
      createdAt: data.created_at,
    });
  });
}
