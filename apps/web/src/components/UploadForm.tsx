"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  FileText,
  Loader2,
  Info,
  UploadCloud,
  X,
} from "lucide-react";
import { createCase } from "@/lib/api";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.csv,.txt,.md,.xls,.xlsx,.doc,.docx";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fellBack, setFellBack] = useState(false);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...incoming.filter((f) => !seen.has(f.name + f.size))];
    });
  };

  const removeFile = (i: number) =>
    setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const onSubmit = async () => {
    if (files.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      // Attempt the real backend; when it lands, this routes to the new case.
      const { caseId } = await createCase(files);
      router.push(`/cases/${caseId}/run`);
    } catch {
      // MVP backend has no upload endpoint yet — degrade honestly, never fake
      // analysis of the uploaded files (CLAUDE.md: don't hallucinate on data).
      setFellBack(true);
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition",
          dragging
            ? "border-brand-400 bg-brand-50/60"
            : "border-slate-300 bg-slate-50",
        )}
      >
        <UploadCloud className="h-8 w-8 text-brand-500" />
        <p className="mt-3 text-sm font-medium text-slate-700">
          Drag & drop the HMA and monthly operating package
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Agreement, operating statement, prior month, support pack · PDF, CSV,
          XLSX, DOCX
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-700"
        >
          <FileText className="h-4 w-4" />
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {/* Selected files */}
      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((f, i) => (
            <li
              key={f.name + f.size}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <FileText className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                {f.name}
              </span>
              <span className="shrink-0 text-xs text-slate-400">
                {fmtSize(f.size)}
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                aria-label={`Remove ${f.name}`}
                className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={files.length === 0 || submitting}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing audit…
          </>
        ) : (
          <>
            Run audit
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      {/* Honest MVP fallback — no faked analysis of uploaded files */}
      {fellBack && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">
                Live document upload isn’t wired into this hosted MVP yet.
              </p>
              <p className="mt-1 text-amber-800">
                The audit engine currently runs on a preloaded synthetic case
                (The Harborline Hotel). Your files stay in your browser and were
                not uploaded. Continue with the demo case to see the full agent
                run.
              </p>
              <Link
                href="/cases/demo/run"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                Run the Harborline demo audit
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
