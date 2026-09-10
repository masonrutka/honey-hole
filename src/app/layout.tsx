import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/*
 * Fraunces for headings. Field guides and outdoor journals have always set
 * their headings in a serif; dashboards never do, which is most of why the
 * stock look reads as generic. Its "soft" and "wonk" axes give it warmth
 * without tipping into novelty.
 */
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  // Absolute base for social image URLs. Vercel injects the deployment host;
  // the production domain is the fallback.
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://honey-hole-one.vercel.app",
  ),
  title: {
    default: "Honey Hole — Wisconsin lake and fishing intelligence",
    template: "%s — Honey Hole",
  },
  description:
    "Species, regulations, conditions and bait suggestions for 5,000 Wisconsin lakes, built on trusted Wisconsin DNR data.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0b100d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-edge bg-background/85 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto w-full max-w-5xl px-4 h-16 flex items-center gap-3">
            <Link href="/" className="flex items-baseline gap-2.5 group">
              {/*
                A honey jar. A fish inside it read as a blob below about 24px,
                and the mark is used at 24px and smaller almost everywhere, so
                the jar carries it alone. The honey surface is deliberately
                irregular -- a symmetric wave cresting dead centre reads as a
                drawn shape rather than as something that settled.
              */}
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6 self-center text-accent shrink-0"
                aria-hidden="true"
              >
                <rect x="6.6" y="1.9" width="10.8" height="2.8" rx="1.2" fill="currentColor" />
                <path
                  d="M8 4.7h8a3.2 3.2 0 0 1 3.2 3.2v10a3.2 3.2 0 0 1-3.2 3.2H8a3.2 3.2 0 0 1-3.2-3.2v-10A3.2 3.2 0 0 1 8 4.7Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path
                  d="M4.8 12.1c1.4.1 2-1.3 3.4-1.4 1.9-.2 2.6 1.6 4.6 1.8 2.3.2 4-1 6.4-1.3v6.6a3.2 3.2 0 0 1-3.2 3.2H8a3.2 3.2 0 0 1-3.2-3.2Z"
                  fill="currentColor"
                  opacity="0.55"
                />
              </svg>
              <span className="display text-[1.35rem] font-semibold leading-none">
                Honey Hole
              </span>
            </Link>
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted hidden sm:inline self-center">
              Wisconsin
            </span>
            <nav className="ml-auto flex items-center gap-5 text-sm self-center">
              <Link href="/species" className="text-muted hover:text-foreground transition-colors">
                Species
              </Link>
              <Link href="/about" className="text-muted hover:text-foreground transition-colors">
                About
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-edge mt-20">
          <div className="mx-auto w-full max-w-5xl px-4 py-8 text-xs text-muted space-y-2">
            <p>
              Lake, species and regulation data from the{" "}
              <a
                className="text-accent hover:underline"
                href="https://dnr.wisconsin.gov/"
                target="_blank"
                rel="noreferrer noopener"
              >
                Wisconsin Department of Natural Resources
              </a>
              . Weather from{" "}
              <a
                className="text-accent hover:underline"
                href="https://open-meteo.com/"
                target="_blank"
                rel="noreferrer noopener"
              >
                Open-Meteo
              </a>
              .
            </p>
            <p>
              Always confirm current regulations with the DNR before you fish. Bite
              and bait ratings are informed suggestions, not guarantees.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
