import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "FeeForensics — Hotel Operator Fee Audit Agent",
  description:
    "Owner-side agent that audits hotel operator fees, reruns the math with a deterministic calculator, and produces a cited, dispute-ready memo.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900 antialiased">
        <header className="sticky top-0 z-20 border-b border-brand-800 bg-brand-900 text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-5 w-5 text-brand-200" />
              <span className="text-lg tracking-tight">FeeForensics</span>
            </Link>
            <div className="flex items-center gap-3 text-xs">
              <span className="hidden rounded-full bg-brand-800 px-2.5 py-1 font-medium text-brand-100 sm:inline">
                Built with Vultr Serverless Inference
              </span>
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 font-medium text-emerald-300 ring-1 ring-emerald-400/30">
                Demo case loaded
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500">
            All documents and financials in this demo are{" "}
            <span className="font-medium text-slate-600">synthetic</span> — no
            real hotel contracts or customer data. Numbers are computed by a
            deterministic calculator; the model extracts rules and writes prose.
          </div>
        </footer>
      </body>
    </html>
  );
}
