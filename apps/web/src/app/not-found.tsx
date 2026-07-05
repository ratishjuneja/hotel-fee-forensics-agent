import Link from "next/link";
import { Compass, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** 404 — the only entry point is an upload, so we point straight there. */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center sm:px-6">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-muted">
        <Compass className="h-6 w-6" />
      </span>
      <p className="mt-5 font-mono text-sm font-semibold text-subtle">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
        This page doesn&apos;t exist.
      </h1>
      <p className="mt-2 text-muted">
        The link may be broken or the case may have been removed. Start a new
        audit from your own documents.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/cases/new">
            <Upload className="h-4 w-4" />
            Audit your fees
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
