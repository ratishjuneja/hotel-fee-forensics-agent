"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  FileText,
  UploadCloud,
  X,
} from "lucide-react";
import { ApiError, createCase, type NewCaseUpload } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { toast } from "@/components/ui/Toaster";
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
const REQUIRED_SLOTS: Slot[] = [
  {
    key: "hma",
    label: "Hotel management agreement",
    hint: "The contract with the fee clauses · PDF, TXT, or MD",
    accept: ".pdf,.txt,.md",
    required: true,
  },
  {
    key: "statement",
    label: "Operating statement",
    hint: "The month you're auditing, operating statement in USALI format · CSV",
    accept: ".csv",
    required: true,
  },
];

const OPTIONAL_SLOTS: Slot[] = [
  {
    key: "statementPrior",
    label: "Comparison statements",
    hint: "One or more earlier months to baseline the anomaly checks · CSV",
    accept: ".csv",
  },
  {
    key: "supportPack",
    label: "Invoices & approvals",
    hint: "Invoices and approvals backing the month's charges · CSV",
    accept: ".csv",
  },
  {
    key: "supplementary",
    label: "Supplementary schedule",
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
      const message = err instanceof ApiError ? err.message : "Upload failed.";
      setFailure(message);
      toast.error("Upload could not be completed", {
        description: "Your files were not stored or analyzed. Please try again.",
      });
      setSubmitting(false);
    }
  };

  return (
    <div>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
          Required
        </legend>
        {REQUIRED_SLOTS.map((slot) => (
          <FileSlot
            key={slot.key}
            slot={slot}
            file={files[slot.key]}
            onChange={(f) => setFile(slot.key, f)}
          />
        ))}
      </fieldset>

      <fieldset className="mt-6 space-y-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
          Optional: strengthen the evidence checks
        </legend>
        {OPTIONAL_SLOTS.map((slot) => (
          <FileSlot
            key={slot.key}
            slot={slot}
            file={files[slot.key]}
            onChange={(f) => setFile(slot.key, f)}
          />
        ))}
      </fieldset>

      <div className="mt-6 space-y-1.5">
        <Label htmlFor="ownerNotes">Anything the audit should know?</Label>
        <Textarea
          id="ownerNotes"
          value={ownerNotes}
          onChange={(e) => setOwnerNotes(e.target.value)}
          rows={3}
          placeholder="Charges you already questioned, approvals you never gave, context on a line item…"
        />
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
        <Checkbox
          checked={draftEmail}
          onCheckedChange={(v) => setDraftEmail(v === true)}
        />
        Draft a dispute email from the findings
      </label>

      <div className="mt-6">
        <Button
          type="button"
          size="lg"
          onClick={onSubmit}
          disabled={!canSubmit}
          loading={submitting}
        >
          {submitting ? "Uploading…" : "Upload & run the audit"}
          {!submitting && <ArrowRight className="h-4 w-4" />}
        </Button>
        {!canSubmit && (
          <p className="mt-2.5 text-xs text-subtle">
            The agreement and the operating statement are required. The other
            documents are optional but sharpen the evidence checks.
          </p>
        )}
      </div>

      {/* Honest failure — the upload did not happen; nothing was analyzed. */}
      {failure && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-xl border border-warning-soft-foreground/25 bg-warning-soft p-4"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-soft-foreground" />
          <div className="text-sm text-warning-soft-foreground">
            <p className="font-semibold">The upload could not be completed.</p>
            <p className="mt-1 opacity-90">
              {failure} Your files were not stored or analyzed. Nothing was
              audited. Check the documents and try again.
            </p>
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
        "flex items-center gap-3 rounded-xl border p-4 transition-colors",
        dragging
          ? "border-primary border-dashed bg-primary-soft"
          : file
            ? "border-success/40 bg-success-soft/50"
            : "border-dashed border-border-strong bg-surface hover:border-primary/50",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
          file
            ? "bg-success-soft text-success-soft-foreground"
            : "bg-surface-2 text-subtle",
        )}
      >
        {file ? (
          <FileText className="h-4 w-4" />
        ) : (
          <UploadCloud className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {slot.label}
          {slot.required && (
            <span className="ml-1 text-danger" aria-hidden>
              *
            </span>
          )}
        </p>
        {file ? (
          <p className="mt-0.5 truncate text-xs text-muted">
            {file.name} · <span className="font-mono">{fmtSize(file.size)}</span>
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted">{slot.hint}</p>
        )}
      </div>
      {file && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          aria-label={`Remove ${file.name}`}
          className="shrink-0 rounded-md p-1 text-subtle transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
      >
        {file ? "Replace" : "Choose file"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={slot.accept}
        className="hidden"
        aria-label={slot.label}
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          if (chosen) onChange(chosen);
          e.target.value = "";
        }}
      />
    </div>
  );
}
