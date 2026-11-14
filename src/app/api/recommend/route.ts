import { NextResponse } from "next/server";
import { encodeAnswers, parseAnswers } from "@/lib/answers";
import { recommend } from "@/lib/engine";
import { getProducts } from "@/lib/server/catalog";
import { InvalidBodyError, readJsonBody } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/recommend: answers in, full kit plus a share token out. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return NextResponse.json({ error: error instanceof InvalidBodyError ? error.message : "Body must be JSON" },
      { status: error instanceof InvalidBodyError ? error.status : 400 });
  }
  const answers = parseAnswers(body);
  if (!answers) return NextResponse.json({ error: "Invalid questionnaire answers" }, { status: 400 });
  try {
    const kit = recommend(answers, await getProducts());
    return NextResponse.json({ token: encodeAnswers(answers), kit }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Catalog is temporarily unavailable" }, { status: 503 });
  }
}
