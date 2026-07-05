import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  Cpu,
  FileSearch,
  Quote,
  Receipt,
  ScrollText,
  Search,
  Sparkles,
  TrendingUp,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/motion/Reveal";

/** What the agent can do — capabilities, never claimed outcomes. */
const CAPABILITIES = [
  {
    icon: FileSearch,
    title: "Reads your agreement",
    body: "Retrieves the base-fee, incentive, revenue-definition, exclusion, and approval clauses from your HMA.",
  },
  {
    icon: Calculator,
    title: "Reruns the math",
    body: "A deterministic calculator recomputes every fee from your statements. The model never does the arithmetic.",
  },
  {
    icon: ScrollText,
    title: "Finds the leakage",
    body: "Compares charged against expected and flags excluded revenue, inflated profit metrics, and improper pass-throughs.",
  },
  {
    icon: Quote,
    title: "Cites every claim",
    body: "Each finding, memo line, and figure points back to a specific clause and financial line — nothing unsupported.",
  },
];

/** The agent's plan, shown as a schematic — no case data, no numbers. */
const PIPELINE = [
  { kind: "LLM", icon: Sparkles, label: "Plan the investigation" },
  { kind: "TOOL", icon: Search, label: "Retrieve the fee clauses & the month's statements" },
  { kind: "TOOL", icon: Calculator, label: "Recompute every fee, deterministically" },
  { kind: "TOOL", icon: Search, label: "Check for excluded revenue & anomalies" },
  { kind: "LLM", icon: ScrollText, label: "Write the cited memo & dispute email" },
] as const;

/** The three leakage patterns the MVP detects — capabilities, not results. */
const SCENARIOS = [
  {
    icon: Receipt,
    title: "Excluded revenue in the fee base",
    body: "Insurance proceeds or cancellation revenue counted in gross operating revenue, inflating the base fee.",
  },
  {
    icon: TrendingUp,
    title: "Incentive fee on inflated profit",
    body: "One-time revenue or a misclassified expense pushes GOP/AGOP over the incentive threshold.",
  },
  {
    icon: FileSearch,
    title: "Improper pass-through expense",
    body: "Corporate support, software, or travel passed through when the base fee should cover it — or it needed your approval.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Upload your documents",
    body: "Your management agreement and the month's operating statement — plus a prior month or invoice pack to strengthen the checks.",
  },
  {
    n: "02",
    title: "Watch the agent work",
    body: "It plans, retrieves clauses and schedules, extracts the fee rules, and recomputes — every step visible in a live trace.",
  },
  {
    n: "03",
    title: "Build the dispute",
    body: "Review cited findings and the confidence breakdown, then copy the draft email or download the dispute packet.",
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="grid items-center gap-12 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Owner-side hotel fee audit agent
          </span>
          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Recompute every operator fee.
            <span className="block text-primary">Cite every dollar.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Your operator charges fees from formulas buried in the agreement.
            Upload the contract and your monthly statements — BellBoy
            extracts the rules, reruns the math with a deterministic calculator,
            finds the leakage, and writes a dispute-ready memo you can trace
            line by line.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/cases/new">
                <Upload className="h-4 w-4" />
                Audit your fees
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="#how-it-works">
                See how it works
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <p className="mt-6 text-xs text-subtle">
            Runs on Vultr Serverless Inference. Nothing is pre-filled — every
            number comes from the documents you upload.
          </p>
        </div>

        <Reveal>
          <AgentPipelineCard />
        </Reveal>
      </section>

      {/* Capabilities */}
      <section className="border-t border-border py-14 sm:py-16">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-subtle">
          What the agent does
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.05}>
              <Card className="h-full p-5" interactive>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                  <Icon className="h-[1.15rem] w-[1.15rem]" />
                </span>
                <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {body}
                </p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="scroll-mt-20 border-t border-border py-14 sm:py-16"
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              An agent, not a chatbot.
            </h2>
            <p className="mt-4 max-w-md text-muted">
              It doesn&apos;t answer after a single lookup. It plans, retrieves
              documents more than once, extracts structured rules, calls
              deterministic tools, and only then decides — and you can watch the
              whole thing.
            </p>
            <ol className="mt-8 space-y-6">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="font-mono text-sm font-semibold text-primary">
                    {s.n}
                  </span>
                  <div>
                    <h3 className="font-semibold text-foreground">{s.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">
                      {s.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-subtle">
              Leakage it&apos;s built to catch
            </h3>
            <div className="mt-6 space-y-4">
              {SCENARIOS.map(({ icon: Icon, title, body }) => (
                <Card key={title} className="flex gap-4 p-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                    <Icon className="h-[1.15rem] w-[1.15rem]" />
                  </span>
                  <div>
                    <h4 className="font-semibold text-foreground">{title}</h4>
                    <p className="mt-1 text-sm leading-relaxed text-muted">
                      {body}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="py-14 sm:py-16">
        <Card className="overflow-hidden">
          <div className="flex flex-col items-start justify-between gap-6 p-8 sm:flex-row sm:items-center sm:p-10">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Ready to check your operator&apos;s math?
              </h2>
              <p className="mt-2 max-w-lg text-muted">
                Upload your agreement and this month&apos;s statement. The audit
                runs on your documents, and every figure is computed — never
                canned.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link href="/cases/new">
                Audit your fees
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}

/** Schematic of the agent's plan. No case data — this is how it works, not a run. */
function AgentPipelineCard() {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-success" aria-hidden />
          <span className="text-sm font-semibold text-foreground">
            The agent&apos;s plan
          </span>
        </div>
        <span className="text-xs text-subtle">schematic</span>
      </div>

      <ol className="relative mt-5">
        {/* connector rail */}
        <span
          className="absolute bottom-3 left-[1.05rem] top-3 w-px bg-border"
          aria-hidden
        />
        {PIPELINE.map((step, i) => {
          const isLlm = step.kind === "LLM";
          const Icon = step.icon;
          return (
            <li key={i} className="relative flex items-center gap-3 py-2.5">
              <span
                className={
                  "relative z-10 flex h-[2.1rem] w-[2.1rem] shrink-0 items-center justify-center rounded-full border bg-surface " +
                  (isLlm
                    ? "border-primary/30 text-primary"
                    : "border-success/30 text-success")
                }
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm text-foreground">
                {step.label}
              </span>
              <span
                className={
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold " +
                  (isLlm
                    ? "bg-primary-soft text-primary-soft-foreground"
                    : "bg-success-soft text-success-soft-foreground")
                }
              >
                {isLlm ? (
                  <Sparkles className="h-3 w-3" />
                ) : (
                  <Cpu className="h-3 w-3" />
                )}
                {step.kind}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-subtle">
        <span className="font-medium text-muted">LLM</span> steps reason over the
        documents; <span className="font-medium text-muted">TOOL</span> steps run
        deterministic code. Your real run shows every step it actually took.
      </p>
    </Card>
  );
}
