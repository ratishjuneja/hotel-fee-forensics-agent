import { cn } from "@/lib/utils";

type BadgeVariant =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "outline";

/**
 * Tinted, token-driven variants. The layout base carries no color, so existing
 * callers that pass their own color utilities via `className` keep full control
 * (their classes win via tailwind-merge). Prefer `variant` in new code.
 */
const VARIANT: Record<BadgeVariant, string> = {
  neutral: "bg-surface-2 text-muted ring-1 ring-inset ring-border",
  primary: "bg-primary-soft text-primary-soft-foreground",
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-danger-soft text-danger-soft-foreground",
  outline: "text-muted ring-1 ring-inset ring-border-strong",
};

export function Badge({
  children,
  className,
  variant,
}: {
  children: React.ReactNode;
  className?: string;
  /** Omit to color entirely via `className` (legacy call sites). */
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        variant && VARIANT[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
