import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "GearFit | The right work gear in 2 minutes",
  description:
    "Answer 5 questions about your trade and get a work boots and PPE kit that meets OSHA, ASTM and ANSI standards, with the real cost per month.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col antialiased">
        <header className="border-b border-zinc-200 print:hidden dark:border-zinc-800">
          <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
              <span className="flex size-7 items-center justify-center rounded-md bg-amber-500 text-sm text-zinc-950">GF</span>
              GearFit
            </Link>
            <div className="flex items-center gap-1 text-sm">
              <Link href="/catalog" className="rounded-md px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                Catalog
              </Link>
              <Link href="/build" className="rounded-md bg-zinc-900 px-3 py-1.5 font-semibold text-white dark:bg-white dark:text-zinc-900">
                Build my kit
              </Link>
            </div>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-zinc-200 py-8 text-center text-xs text-zinc-500 print:hidden dark:border-zinc-800">
          GearFit is a buying guide, not a substitute for your employer&apos;s safety program. Built at Business Cup 2.0.
        </footer>
      </body>
    </html>
  );
}
