"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

/**
 * Opens the browser print dialog once the printable report has mounted (the
 * user picks "Save as PDF"). Also renders a manual trigger in case they cancel.
 * Zero dependencies — the browser's own PDF engine produces the file, so it is
 * reliable across environments and yields selectable, vector text.
 */
export function AutoPrint() {
  useEffect(() => {
    // Let the layout settle (fonts/markdown) before invoking print.
    const t = setTimeout(() => window.print(), 500);
    return () => clearTimeout(t);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
    >
      <Printer className="h-4 w-4" />
      Print / Save as PDF
    </button>
  );
}
