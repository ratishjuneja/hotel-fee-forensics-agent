import Link from "next/link";
import { ArrowLeft, Database, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { UploadForm } from "@/components/UploadForm";

export const metadata = {
  title: "Start an audit",
};

export default function NewCasePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/">
          <ArrowLeft className="h-4 w-4" />
          Home
        </Link>
      </Button>

      <header className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Start an audit
        </h1>
        <p className="mt-2 text-muted">
          Upload your hotel management agreement and the month&apos;s operating
          package. The agent extracts the fee rules, recomputes every fee, and
          produces a cited, dispute-ready memo.
        </p>
      </header>

      <Card className="mt-6 p-5 sm:p-6">
        <UploadForm />
      </Card>

      <div className="mt-6 grid gap-3 text-xs text-muted sm:grid-cols-2">
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 p-3">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
          <p>
            Files are stored in Vultr Object Storage and parsed into a new case.
            Every figure on the report is computed from what you upload;
            nothing is pre-filled.
          </p>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 p-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
          <p>
            If a charge can&apos;t be verified from the documents, the agent
            pauses and asks you rather than guessing.
          </p>
        </div>
      </div>
    </div>
  );
}
