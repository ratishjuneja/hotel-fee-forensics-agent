"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/** Root error boundary — honest, actionable, never a blank white screen. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for debugging; no user data is invented to paper over the failure.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center sm:px-6">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning-soft text-warning-soft-foreground">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
        Something went wrong.
      </h1>
      <p className="mt-2 text-muted">
        The page hit an unexpected error. Nothing was changed or analyzed — you
        can try again, or head back and start a fresh audit.
      </p>
      {error.digest && (
        <Card className="mt-4 px-3 py-2">
          <code className="font-mono text-xs text-subtle">
            ref: {error.digest}
          </code>
        </Card>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
