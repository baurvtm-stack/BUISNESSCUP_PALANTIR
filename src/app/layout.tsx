import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import "./globals.css";

const body = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const heading = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
});

/** Absolute base for share and OG links. A malformed env value must never break the build. */
function siteUrl(): URL {
  const env = process.env;
  for (const value of [env.NEXT_PUBLIC_SITE_URL, env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL]) {
    if (!value?.trim()) continue;
    try {
      return new URL(/^https?:\/\//.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    } catch {
      /* try the next candidate */
    }
  }
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "GearFit | Work gear that passes the site check",
    template: "%s | GearFit",
  },
  description:
    "Answer 5 questions about your trade and get a complete boots-to-hard-hat kit that meets OSHA, ASTM and ANSI standards, with the real cost per month of wear. Free, no sign-up.",
  applicationName: "GearFit",
  openGraph: {
    type: "website",
    siteName: "GearFit",
    title: "GearFit | Work gear that passes the site check",
    description: "A complete work boots and PPE kit for your trade in 2 minutes, matched to safety standards and priced per month.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1012" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable}`}>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-accent px-4 py-2 font-semibold text-[#15171a] focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
        >
          Skip to content
        </a>
        <SiteHeader />
        <div id="main" className="flex flex-1 flex-col">
          {children}
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
