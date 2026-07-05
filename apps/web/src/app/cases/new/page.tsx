import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { UploadForm } from "@/components/UploadForm";

export const metadata = {
  title: "Start a new audit · FeeForensics",
};

export default function NewCasePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Home
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Start a new audit
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload a hotel management agreement and the monthly operating package.
          FeeForensics extracts the fee rules, recomputes every fee, and produces
          a cited, dispute-ready memo.
        </p>
      </header>

      <div className="mt-6">
        <UploadForm />
      </div>

      <p className="mt-8 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
        Uploads are stored in Vultr Object Storage and parsed into a new case.
        Every finding, number, and citation on the report is computed from the
        documents you upload — nothing is pre-filled.
      </p>
    </div>
  );
}
