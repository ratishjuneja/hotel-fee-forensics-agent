import { cn } from "@/lib/utils";

/**
 * Slim progress track. Pass `value` (0–100) for determinate progress, or omit
 * for an indeterminate sweep while the duration of work is unknown.
 */
export function Progress({
  value,
  className,
  tone = "primary",
  label,
}: {
  value?: number;
  className?: string;
  tone?: "primary" | "success" | "warning" | "danger";
  label?: string;
}) {
  const clamped =
    value === undefined ? undefined : Math.max(0, Math.min(100, value));
  const bar = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tone];

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(clamped !== undefined ? { "aria-valuenow": Math.round(clamped) } : {})}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-surface-3",
        className,
      )}
    >
      {clamped === undefined ? (
        <div
          className={cn("h-full w-1/3 rounded-full animate-progress-sweep", bar)}
        />
      ) : (
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-out", bar)}
          style={{ width: `${clamped}%` }}
        />
      )}
    </div>
  );
}
