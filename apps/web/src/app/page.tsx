import Link from "next/link";
import {
  Calculator,
  FileSearch,
  Quote,
  ScrollText,
  Upload,
} from "lucide-react";

const CAPABILITIES = [
  {
    icon: FileSearch,
    title: "Reads the agreement",
    body: "Retrieves base-fee, incentive, exclusion, and approval clauses from the HMA.",
  },
  {
    icon: Calculator,
    title: "Reruns the math",
    body: "A deterministic calculator recomputes every fee — never LLM arithmetic.",
  },
  {
    icon: ScrollText,
    title: "Finds the leakage",
    body: "Flags excluded revenue, inflated GOP, and improper pass-throughs.",
  },
  {
    icon: Quote,
    title: "Cites everything",
    body: "Produces a dispute-ready memo and email, each grounded in a clause + line.",
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="grid gap-10 py-16 md:grid-cols-2 md:items-center md:py-24">
        <div>
          <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
            Owner-side hotel fee audit agent
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Operators charge fees from formulas buried in the contract.
            <span className="text-brand-600"> We rerun the math.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-600">
            Upload your hotel management agreement and monthly operating package.
            FeeForensics extracts the fee rules, recomputes every fee, finds the
            leakage, and generates a cited, dispute-ready audit memo — with a
            visible agent trace over your own documents.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/cases/new"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              <Upload className="h-4 w-4" />
              Upload documents &amp; run audit
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Built with Vultr Serverless Inference · Every result is computed from
            the documents you upload
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {CAPABILITIES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-5">
              <Icon className="h-6 w-6 text-brand-600" />
              <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
