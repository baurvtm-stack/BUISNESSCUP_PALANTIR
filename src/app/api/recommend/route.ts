import { NextResponse } from "next/server";
import { encodeAnswers, parseAnswers } from "@/lib/answers";
import { recommend } from "@/lib/engine";

/** POST /api/recommend: answers in, full kit plus a share token out. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const answers = parseAnswers(body);
  if (!answers) return NextResponse.json({ error: "Unknown or missing trade" }, { status: 400 });
  const kit = recommend(answers);
  return NextResponse.json({ token: encodeAnswers(answers), kit });
}
