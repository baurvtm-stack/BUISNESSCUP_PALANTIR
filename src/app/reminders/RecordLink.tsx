"use client";

import { useEffect } from "react";
import { recordReminderLink, savedKits } from "@/lib/saved-kits";

/** Remembers on this device what the emailed link just did, so the kit page shows the same. */
export default function RecordLink({ slug, status }: { slug: string; status: string }) {
  useEffect(() => {
    savedKits.set((kits) => recordReminderLink(kits, slug, status));
  }, [slug, status]);
  return null;
}
