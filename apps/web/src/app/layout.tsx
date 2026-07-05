import type { Metadata } from "next";
import Link from "next/link";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ShieldCheck } from "lucide-react";
import { ThemeProvider, themeScript } from "@/components/theme/ThemeProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Toaster } from "@/components/ui/Toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "BellBoy: Hotel operator fee audit agent",
    template: "%s · BellBoy",
  },
  description:
    "Upload your hotel management agreement and monthly operating statements. BellBoy reruns every fee with a deterministic calculator, finds the leakage, and writes a cited, dispute-ready memo, with a visible agent trace.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the stored theme before first paint — no flash on load. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
        <ThemeProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-md"
          aria-label="BellBoy home"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[0.95rem] font-semibold tracking-tight text-foreground">
              BellBoy
            </span>
            <span className="hidden text-xs font-medium text-subtle sm:inline">
              Fee audit agent
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted md:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
            Runs on Vultr Serverless Inference
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-4 py-5 text-xs text-subtle sm:px-6">
        <p>
          Every figure on screen is computed by a deterministic calculator from
          the documents you upload. The model extracts rules and drafts prose;
          it never does the arithmetic.
        </p>
      </div>
    </footer>
  );
}
