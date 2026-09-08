import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Honey Hole — Wisconsin lake and fishing intelligence",
    template: "%s — Honey Hole",
  },
  description:
    "Species, regulations, conditions and bait suggestions for 5,000 Wisconsin lakes, built on open Wisconsin DNR data.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0a1018",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-edge/70 bg-surface/40 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto w-full max-w-5xl px-4 h-14 flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-accent" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M2 13c3-5 7-7 11-7 3.6 0 6.4 1.7 8.4 4.2.4.5.4 1.1 0 1.6C19.4 14.3 16.6 16 13 16c-4 0-8-2-11-3Zm11-4.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"
                />
                <path fill="currentColor" opacity=".55" d="M2 13c1.6 2.4 3.4 4.2 5.2 5.3-.6-1.9-.7-3.7-.3-5.3-1.7-.1-3.3-.1-4.9 0Z" />
              </svg>
              Honey Hole
            </Link>
            <span className="text-xs text-muted hidden sm:inline">Wisconsin</span>
            <nav className="ml-auto flex items-center gap-4 text-sm">
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

        <footer className="border-t border-edge/70 mt-16">
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
