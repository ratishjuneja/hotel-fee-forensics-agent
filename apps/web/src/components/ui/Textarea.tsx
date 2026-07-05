import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/** Multiline input on semantic tokens; shares the global focus-visible ring. */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-[5rem] w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground shadow-xs transition-colors",
      "placeholder:text-subtle",
      "focus-visible:border-primary",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
