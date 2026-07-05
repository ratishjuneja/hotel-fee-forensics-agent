"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toaster";

/** Downloads `content` as a local file (memo markdown / dispute packet). */
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
    toast.success("Download started", { description: filename });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
      <Download className="h-4 w-4" />
      {label}
    </Button>
  );
}
