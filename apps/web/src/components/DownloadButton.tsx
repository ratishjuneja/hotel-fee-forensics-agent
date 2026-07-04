"use client";

import { Download } from "lucide-react";

/** Downloads `content` as a local file (used for the memo markdown). */
export function DownloadButton({
  content,
  filename,
  label = "Download",
}: {
  content: string;
  filename: string;
  label?: string;
}) {
  function handleDownload() {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
    >
      <Download className="h-4 w-4" />
      {label}
    </button>
  );
}
