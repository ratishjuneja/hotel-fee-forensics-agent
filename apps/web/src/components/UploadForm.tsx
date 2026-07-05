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
import { ApiError, createCase, type NewCaseUpload } from "@/lib/api";
import { cn } from "@/lib/utils";

type SlotKey = keyof Pick<
  NewCaseUpload,
  "hma" | "statement" | "statementPrior" | "supportPack" | "supplementary"
>;

interface Slot {
  key: SlotKey;
  label: string;
  hint: string;
  accept: string;
  required?: boolean;
}

/** One labeled slot per document role — mirrors the API's multipart contract. */
const SLOTS: Slot[] = [
  {
    key: "hma",
    label: "Hotel Management Agreement (HMA)",
    hint: "The agreement with the fee clauses · PDF, TXT or MD",
    accept: ".pdf,.txt,.md",
    required: true,
  },
  {
    key: "statement",
    label: "Operating Statement",
    hint: "The audit month's USALI operating statement · CSV",
    accept: ".csv",
    required: true,
  },
  {
    key: "statementPrior",
    label: "Past Operating Statement",
    hint: "A prior month — the baseline for anomaly checks · CSV",
    accept: ".csv",
  },
  {
    key: "supportPack",
    label: "Collated Invoices",
    hint: "Support / invoice pack backing the month's charges · CSV",
    accept: ".csv",
  },
  {
    key: "supplementary",
    label: "Supplementary schedule (optional)",
    hint: "Detail behind a statement roll-up, e.g. a misc-income breakout · CSV",
    accept: ".csv",
  },
];

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadForm() {
  const router = useRouter();
  const [files, setFiles] = useState<Partial<Record<SlotKey, File>>>({});
  const [ownerNotes, setOwnerNotes] = useState("");
  const [draftEmail, setDraftEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const setFile = (key: SlotKey, file: File | undefined) =>
    setFiles((prev) => {
      const next = { ...prev };
      if (file) next[key] = file;
      else delete next[key];
      return next;
    });

  const canSubmit = files.hma !== undefined && files.statement !== undefined;

  const onSubmit = async () => {
    if (!files.hma || !files.statement || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const { caseId } = await createCase({
        hma: files.hma,
        statement: files.statement,
        ...(files.statementPrior ? { statementPrior: files.statementPrior } : {}),
        ...(files.supportPack ? { supportPack: files.supportPack } : {}),
        ...(files.supplementary ? { supplementary: files.supplementary } : {}),
        ...(ownerNotes.trim() ? { ownerNotes } : {}),
        draftEmail,
      });
      router.push(`/cases/${caseId}`);
    } catch (err) {
      // Honest failure — never fake analysis of files that were not accepted.
      setFailure(err instanceof ApiError ? err.message : "Upload failed.");
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Document slots */}
      <div className="space-y-3">
        {SLOTS.map((slot) => (
          <FileSlot
            key={slot.key}
            slot={slot}
            file={files[slot.key]}
            onChange={(f) => setFile(slot.key, f)}
          />
        ))}
      </div>

      {/* Additional info */}
      <label className="mt-5 block">
        <span className="text-sm font-medium text-slate-700">
          Additional info
        </span>
        <textarea
          value={ownerNotes}
          onChange={(e) => setOwnerNotes(e.target.value)}
          rows={3}
          placeholder="Anything the audit should know — e.g. charges you already questioned, approvals you never gave…"
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-300"
        />
      </label>

      {/* Draft email opt-out */}
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={draftEmail}
          onChange={(e) => setDraftEmail(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
        />
        Draft a dispute email from the findings
      </label>

      {/* Submit */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit || submitting}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading…
          </>
        ) : (
          <>
            Upload &amp; run audit
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
      {!canSubmit && (
        <p className="mt-2 text-xs text-slate-500">
          The HMA and the operating statement are required; the other documents
          strengthen the audit&apos;s evidence checks.
        </p>
      )}

      {/* Honest failure — the upload did not happen; nothing was analyzed */}
      {failure && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">The upload could not be completed.</p>
              <p className="mt-1 text-amber-800">
                {failure} Your files were not stored or analyzed. You can retry,
                or explore the full agent run on the preloaded synthetic case
                (The Harborline Hotel).
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

function FileSlot({
  slot,
  file,
  onChange,
}: {
  slot: Slot;
  file: File | undefined;
  onChange: (file: File | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) onChange(dropped);
      }}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4 transition",
        dragging
          ? "border-brand-400 border-dashed bg-brand-50/60"
          : file
            ? "border-emerald-200 bg-emerald-50/40"
            : "border-slate-200 bg-white",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          file ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400",
        )}
      >
        {file ? <FileText className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800">
          {slot.label}
          {slot.required && <span className="ml-1 text-rose-500">*</span>}
        </p>
        {file ? (
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {file.name} · {fmtSize(file.size)}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-slate-500">{slot.hint}</p>
        )}
      </div>
      {file && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          aria-label={`Remove ${file.name}`}
          className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-700"
      >
        {file ? "Replace" : "Choose file"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={slot.accept}
        className="hidden"
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          if (chosen) onChange(chosen);
          e.target.value = "";
        }}
      />
    </div>
  );
}
