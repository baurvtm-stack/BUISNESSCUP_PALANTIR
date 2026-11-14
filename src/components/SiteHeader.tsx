"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { proStore, savedKits } from "@/lib/saved-kits";
import { Icon } from "./icons";
import { ButtonLink, Logo } from "./ui";

const LINKS = [
  { href: "/compare", label: "Compare" },
  { href: "/catalog", label: "Catalog" },
  { href: "/pro", label: "Pro" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const kits = savedKits.useValue();
  const pro = proStore.useValue();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // The bar picks up a shadow once the page moves under it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu on outside click and Escape (links close it on click).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const onBuild = pathname.startsWith("/build");

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-paper/85 backdrop-blur-md transition-[box-shadow,border-color] duration-300 print:hidden ${
        scrolled ? "border-line shadow-[0_10px_30px_-22px_rgb(0_0_0/0.45)]" : "border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-15 max-w-6xl items-center gap-2 px-4 sm:px-6" aria-label="Main">
        <Link href="/" className="mr-auto rounded-lg" aria-label="GearFit home">
          <Logo />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active(l.href) ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active(l.href) ? "bg-sunken text-ink" : "text-ink-2 hover:bg-sunken hover:text-ink"
              }`}
            >
              {l.label}
              {l.href === "/pro" && pro && (
                <span className="rounded bg-accent px-1 text-[10px] font-bold uppercase leading-4 text-[#15171a]">On</span>
              )}
            </Link>
          ))}
        </div>

        <Link
          href="/kits"
          aria-current={active("/kits") ? "page" : undefined}
          className={`relative flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition sm:px-3 ${
            active("/kits") ? "bg-sunken text-ink" : "text-ink-2 hover:bg-sunken hover:text-ink"
          }`}
        >
          <Icon name="bookmark" className="size-[18px]" />
          <span className="hidden sm:inline">My kits</span>
          {kits.length > 0 && (
            <span
              key={kits.length}
              className="animate-bump tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[11px] font-bold text-paper"
            >
              {kits.length}
            </span>
          )}
          <span className="sr-only sm:hidden">My kits</span>
        </Link>

        {!onBuild && (
          <ButtonLink href="/build" size="sm" iconRight="arrowRight">
            Build my kit
          </ButtonLink>
        )}

        <div className="relative md:hidden" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="flex size-10 items-center justify-center rounded-lg text-ink-2 hover:bg-sunken"
          >
            <Icon name={open ? "x" : "menu"} className="size-5" />
            <span className="sr-only">Menu</span>
          </button>
          {open && (
            <div
              id="mobile-menu"
              className="animate-rise absolute right-0 top-12 w-56 overflow-hidden rounded-2xl border border-line bg-card p-1.5 shadow-xl shadow-black/10"
            >
              {[{ href: "/build", label: "Build my kit" }, { href: "/kits", label: "My kits" }, ...LINKS].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-[15px] font-medium ${
                    active(l.href) ? "bg-sunken text-ink" : "text-ink-2 hover:bg-sunken"
                  }`}
                >
                  {l.label}
                  <Icon name="chevronRight" className="size-4 text-ink-3" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
