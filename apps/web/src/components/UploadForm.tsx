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
import { ApiError, createCase } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { toast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";

/** Single-file (required) roles. */
type SingleKey = "hma" | "statement";
/** Multi-file (optional) roles — several files each. */
type MultiKey = "statementPrior" | "supportPack" | "supplementary" | "extraDocs";

interface SingleSlot {
  key: SingleKey;
  label: string;
  hint: string;
  accept: string;
}

interface MultiSlot {
  key: MultiKey;
  label: string;
  hint: string;
  accept: string;
}

/** Client-side mirror of the API's per-file cap — reject before any upload. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** One labeled slot per document role — mirrors the API's multipart contract. */
const REQUIRED_SLOTS: SingleSlot[] = [
  {
    key: "hma",
    label: "Hotel management agreement",
    hint: "The contract with the fee clauses · PDF, TXT, or MD",
    accept: ".pdf,.txt,.md",
  },
  {
    key: "statement",
    label: "Operating statement",
    hint: "The month you're auditing, operating statement in USALI format · CSV",
    accept: ".csv",
  },
];

const OPTIONAL_SLOTS: MultiSlot[] = [
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
  {
    key: "extraDocs",
    label: "Extra documents",
    hint: "Anything else that backs the month — memos, side letters, extra schedules. Stored with the case; not used in the calculation · PDF, TXT, MD, or CSV",
    accept: ".pdf,.txt,.md,.csv",
  },
];

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Split a batch on the 10 MB cap; toast the rejects, return the keepers. */
function screenSize(list: File[]): File[] {
  const ok: File[] = [];
  const rejected: string[] = [];
  for (const file of list) {
    if (file.size > MAX_FILE_BYTES) rejected.push(file.name);
    else ok.push(file);
  }
  if (rejected.length > 0) {
    toast.error(rejected.length === 1 ? "File is too large" : "Some files are too large", {
      description: `Each file must be under 10 MB. Skipped: ${rejected.join(", ")}.`,
    });
  }
  return ok;
}

export function UploadForm() {
  const router = useRouter();
  const [files, setFiles] = useState<Partial<Record<SingleKey, File>>>({});
  const [multi, setMulti] = useState<Record<MultiKey, File[]>>({
    statementPrior: [],
    supportPack: [],
    supplementary: [],
    extraDocs: [],
  });
  const [hotelName, setHotelName] = useState("");
  const [auditMonth, setAuditMonth] = useState("");
  const [ownerNotes, setOwnerNotes] = useState("");
  const [draftEmail, setDraftEmail] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const setFile = (key: SingleKey, file: File | undefined) => {
    if (file && screenSize([file]).length === 0) return;
    setFiles((prev) => {
      const next = { ...prev };
      if (file) next[key] = file;
      else delete next[key];
      return next;
    });
  };

  const addMulti = (key: MultiKey, incoming: File[]) => {
    const ok = screenSize(incoming);
    if (ok.length === 0) return;
    setMulti((prev) => ({ ...prev, [key]: [...prev[key], ...ok] }));
  };

  const removeMulti = (key: MultiKey, index: number) =>
    setMulti((prev) => ({ ...prev, [key]: prev[key].filter((_, i) => i !== index) }));

  const canSubmit = files.hma !== undefined && files.statement !== undefined;

  const onSubmit = async () => {
    if (!files.hma || !files.statement || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const { caseId } = await createCase({
        hma: files.hma,
        statement: files.statement,
        ...(multi.statementPrior.length ? { statementPrior: multi.statementPrior } : {}),
        ...(multi.supportPack.length ? { supportPack: multi.supportPack } : {}),
        ...(multi.supplementary.length ? { supplementary: multi.supplementary } : {}),
        ...(multi.extraDocs.length ? { extraDocs: multi.extraDocs } : {}),
        ...(hotelName.trim() ? { hotelName } : {}),
        ...(auditMonth.trim() ? { auditMonth } : {}),
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

  const fieldClass =
    "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground shadow-xs transition-colors placeholder:text-subtle focus-visible:border-primary";

  return (
    <div>
      {/* Two-column on large screens so the whole form reads on one page:
          case details + required documents on the left, the optional evidence
          on the right. Collapses to a single column below `lg`. */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* min-w-0 lets each grid column shrink below its content's intrinsic
            width so long filenames truncate instead of overflowing the track. */}
        <div className="min-w-0 space-y-6">
          {/* Case label — the statements carry no reporting month, so the owner
              names the case and its audit month here. Both feed the report
              header, memo, and dispute email. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hotelName">Hotel name</Label>
              <input
                id="hotelName"
                type="text"
                value={hotelName}
                onChange={(e) => setHotelName(e.target.value)}
                placeholder="e.g. The Cedarcrest Inn"
                className={fieldClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auditMonth">Audit month</Label>
              <input
                id="auditMonth"
                type="text"
                value={auditMonth}
                onChange={(e) => setAuditMonth(e.target.value)}
                placeholder="e.g. September 2026"
                className={fieldClass}
              />
            </div>
          </div>

          {/* min-w-0 overrides <fieldset>'s default min-inline-size:min-content,
              which otherwise stops the column shrinking and makes long filenames
              overflow into the right column. */}
          <fieldset className="min-w-0 space-y-3">
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
        </div>

        <fieldset className="min-w-0 space-y-3">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
            Optional: strengthen the evidence checks
          </legend>
          {OPTIONAL_SLOTS.map((slot) => (
            <MultiFileSlot
              key={slot.key}
              slot={slot}
              filesList={multi[slot.key]}
              onAdd={(list) => addMulti(slot.key, list)}
              onRemove={(i) => removeMulti(slot.key, i)}
            />
          ))}
        </fieldset>
      </div>

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
  slot: SingleSlot;
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
          <span className="ml-1 text-danger" aria-hidden>
            *
          </span>
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

function MultiFileSlot({
  slot,
  filesList,
  onAdd,
  onRemove,
}: {
  slot: MultiSlot;
  filesList: File[];
  onAdd: (list: File[]) => void;
  onRemove: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const has = filesList.length > 0;

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
        const dropped = Array.from(e.dataTransfer.files ?? []);
        if (dropped.length) onAdd(dropped);
      }}
      className={cn(
        "rounded-xl border p-4 transition-colors",
        dragging
          ? "border-primary border-dashed bg-primary-soft"
          : has
            ? "border-success/40 bg-success-soft/50"
            : "border-dashed border-border-strong bg-surface hover:border-primary/50",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
            has
              ? "bg-success-soft text-success-soft-foreground"
              : "bg-surface-2 text-subtle",
          )}
        >
          {has ? (
            <FileText className="h-4 w-4" />
          ) : (
            <UploadCloud className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{slot.label}</p>
          <p className="mt-0.5 text-xs text-muted">
            {has
              ? `${filesList.length} file${filesList.length > 1 ? "s" : ""} selected`
              : slot.hint}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          {has ? "Add more" : "Add files"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={slot.accept}
          className="hidden"
          aria-label={slot.label}
          onChange={(e) => {
            const chosen = Array.from(e.target.files ?? []);
            if (chosen.length) onAdd(chosen);
            e.target.value = "";
          }}
        />
      </div>

      {/* Compact per-file list so many files don't blow up the page height. */}
      {has && (
        <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto border-t border-border pt-3">
          {filesList.map((file, i) => (
            <li key={`${file.name}-${file.size}-${i}`} className="flex items-center gap-2 text-xs">
              <FileText className="h-3.5 w-3.5 shrink-0 text-subtle" />
              <span className="min-w-0 flex-1 truncate text-muted">
                {file.name} · <span className="font-mono">{fmtSize(file.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${file.name}`}
                className="shrink-0 rounded-md p-1 text-subtle transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
