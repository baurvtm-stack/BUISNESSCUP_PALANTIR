import Link from "next/link";
import { Logo } from "./ui";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/build", label: "Build a kit" },
      { href: "/compare", label: "Compare price tiers" },
      { href: "/kits", label: "My kits" },
      { href: "/pro", label: "GearFit Pro" },
    ],
  },
  {
    title: "Reference",
    links: [
      { href: "/catalog", label: "Gear catalog" },
      { href: "/#how", label: "How matching works" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-card print:hidden">
      <div className="hazard h-1.5" aria-hidden />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-2">
            Work boots and PPE matched to the safety standards your trade calls for, priced by what they really cost per month of
            wear.
          </p>
          <p className="mt-4 max-w-sm text-xs leading-relaxed text-ink-3">
            GearFit is a buying guide, not a substitute for your employer&apos;s safety program. Prices are approximate. We may
            earn a commission when you buy through our links, at no extra cost to you.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-ink-2 hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-ink-3 sm:px-6">Built at Business Cup 2.0, Nazarbayev University.</p>
      </div>
    </footer>
  );
}
