import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Friendly failure surface when the API is unreachable. During the demo the
 * likely cause is the Fastify server not running (npm run dev:api from root).
 */
export function ApiErrorPanel({ message }: { message: string }) {
  return (
    <div className="card border-amber-200 bg-amber-50 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <h2 className="font-semibold text-amber-900">{message}</h2>
          <p className="mt-1 text-sm text-amber-800">
            Make sure the API is running:{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">
              npm run dev:api
            </code>{" "}
            from the repo root (expects it on{" "}
            <code className="font-mono text-xs">http://localhost:4000</code>).
          </p>
          <Link
            href="/cases/demo"
            className="mt-3 inline-block text-sm font-semibold text-amber-900 underline"
          >
            Retry
          </Link>
        </div>
      </div>
    </div>
  );
}
