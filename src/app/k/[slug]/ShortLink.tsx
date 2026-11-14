"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { ButtonLink } from "@/components/ui";
import { encodeAnswers } from "@/lib/answers";
import { getKitFromCloud } from "@/lib/api/client";
import { kitHref } from "@/lib/kit-url";
import { savedKits } from "@/lib/saved-kits";

export default function ShortLink({ slug }: { slug: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<"loading" | "missing" | "unavailable">("loading");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // A kit saved on this device opens instantly; otherwise ask the API.
    const local = savedKits.get().find((k) => k.slug === slug);
    if (local) {
      router.replace(kitHref(local.token, { choices: local.choices, slug }));
      return;
    }
    getKitFromCloud(slug).then((out) => {
      if (out.kind === "ok") {
        const choices = out.data.items.map((i) => i.productId);
        router.replace(kitHref(encodeAnswers(out.data.answers), { choices, slug }));
      } else {
        setState(out.kind === "rejected" ? "missing" : "unavailable");
      }
    });
  }, [router, slug]);

  if (state === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-24">
        <span className="size-10 animate-spin rounded-full border-4 border-line border-t-accent" aria-label="Opening kit" />
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-24">
      <div className="max-w-md text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-warn-soft text-warn">
          <Icon name="link" className="size-6" />
        </span>
        <h1 className="mt-5 font-display text-3xl font-bold">
          {state === "missing" ? "This kit link has expired" : "We can't open short links right now"}
        </h1>
        <p className="mt-2 text-ink-2">
          {state === "missing"
            ? "Ask whoever sent it for a new link, or build your own kit in two minutes."
            : "Try again in a minute, or ask for the full kit link."}
        </p>
        <ButtonLink href="/build" className="mt-6" iconRight="arrowRight">
          Build a kit
        </ButtonLink>
      </div>
    </main>
  );
}
