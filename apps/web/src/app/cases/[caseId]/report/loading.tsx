import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

/** Honest loading state while the report is fetched server-side. */
export default function ReportLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Skeleton className="h-8 w-28" />

      <Card className="mt-4 grid gap-6 p-6 sm:grid-cols-[1.2fr_1fr]">
        <div>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-12 w-52" />
          <Skeleton className="mt-2 h-3.5 w-56" />
        </div>
        <div className="border-t border-border pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-9 w-24" />
          <Skeleton className="mt-3 h-2 w-full" />
        </div>
      </Card>

      <Skeleton className="mt-10 h-6 w-28" />
      <div className="mt-3 space-y-4">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="mt-2.5 h-4 w-64" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>
            <Skeleton className="mt-3 h-3.5 w-full" />
            <Skeleton className="mt-1.5 h-3.5 w-4/5" />
          </Card>
        ))}
      </div>
    </div>
  );
}
