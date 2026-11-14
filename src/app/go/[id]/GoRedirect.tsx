"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { ButtonLink } from "@/components/ui";
import { resolveClick } from "@/lib/api/client";

export default function GoRedirect({
  productId,
  kitId,
  fallbackUrl,
  name,
}: {
  productId: string;
  kitId?: string;
  fallbackUrl: string | null;
  name: string | null;
}) {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Guard against double-logging the click when effects re-run in development.
    if (started.current) return;
    started.current = true;
    resolveClick({ productId, kitId }, fallbackUrl).then(({ url }) => {
      if (url) window.location.replace(url);
      else setFailed(true);
    });
  }, [productId, kitId, fallbackUrl]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-24">
      <div className="max-w-md text-center">
        {failed ? (
          <>
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-warn-soft text-warn">
              <Icon name="alert" className="size-6" />
            </span>
            <h1 className="mt-5 font-display text-3xl font-bold">We couldn&apos;t find that product</h1>
            <p className="mt-2 text-ink-2">It may have left our catalog. Browse similar gear instead.</p>
            <ButtonLink href="/catalog" className="mt-6" iconRight="arrowRight">
              Open the catalog
            </ButtonLink>
          </>
        ) : (
          <>
            <span className="mx-auto block size-10 animate-spin rounded-full border-4 border-line border-t-accent" aria-hidden />
            <h1 className="mt-6 font-display text-3xl font-bold">Opening the retailer…</h1>
            {name && <p className="mt-2 font-medium text-ink-2">{name}</p>}
            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              Prices change often, so check the final price at checkout. GearFit may earn a commission, at no extra cost to you.
            </p>
            {fallbackUrl && (
              <a href={fallbackUrl} rel="noopener sponsored" className="mt-5 inline-block text-sm font-semibold text-accent-ink underline-offset-4 hover:underline">
                Not moving? Continue to the retailer
              </a>
            )}
          </>
        )}
      </div>
    </main>
  );
}
