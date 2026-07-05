import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/** Text input on semantic tokens; shares the global focus-visible ring. */
export const Input = forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground shadow-xs transition-colors",
        "placeholder:text-subtle",
        "focus-visible:border-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
