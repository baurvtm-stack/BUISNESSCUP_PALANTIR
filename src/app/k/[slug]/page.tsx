import type { Metadata } from "next";
import ShortLink from "./ShortLink";

export const metadata: Metadata = {
  title: "Opening kit",
  robots: { index: false },
};

/** Short share link (/k/abc123) for a kit saved with POST /api/kits. */
export default async function ShortLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ShortLink slug={slug} />;
}
