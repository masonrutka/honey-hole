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
    "Species, regulations, conditions and bait suggestions for 5,000 Wisconsin lakes, built on open Wisconsin DNR data.",
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
              {/* Concentric depth rings: the app's own subject as its mark. */}
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 self-center text-accent shrink-0"
                aria-hidden="true"
              >
                <g fill="none" stroke="currentColor" strokeWidth="1.4">
                  <ellipse cx="12" cy="12" rx="9.5" ry="7" opacity=".35" />
                  <ellipse cx="12" cy="12" rx="6" ry="4.4" opacity=".65" />
                  <ellipse cx="12" cy="12" rx="2.6" ry="1.9" />
                </g>
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
