import { cn } from "@/lib/utils";

/**
 * Loading placeholder. Uses the shimmer sweep (disabled under reduced-motion,
 * where it degrades to a static block). Never seeds fake content — it stands in
 * for data that is genuinely still loading.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("shimmer rounded-md bg-surface-2", className)}
      aria-hidden
      {...props}
    />
  );
}
