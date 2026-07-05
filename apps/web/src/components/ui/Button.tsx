"use client";

import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "link";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover active:translate-y-px",
  secondary:
    "border border-border bg-surface-2 text-foreground hover:bg-surface-3 active:translate-y-px",
  outline:
    "border border-border-strong bg-transparent text-foreground hover:bg-surface-2 active:translate-y-px",
  ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
  destructive:
    "bg-danger text-danger-foreground shadow-sm hover:bg-danger/90 active:translate-y-px",
  link: "text-primary underline-offset-4 hover:underline",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-md px-3 text-sm",
  md: "h-10 gap-2 rounded-lg px-4 text-sm",
  lg: "h-11 gap-2 rounded-lg px-5 text-[0.9375rem]",
  icon: "h-10 w-10 rounded-lg",
  "icon-sm": "h-8 w-8 rounded-md",
};

/** Shared button styling — reuse for links that should look like buttons. */
export function buttonVariants({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
} = {}): string {
  return cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background-color,color,transform,box-shadow] duration-150 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
    variant !== "link" && "font-semibold",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Render into a child element (e.g. a Next.js <Link>) instead of a <button>. */
  asChild?: boolean;
  /** Show a spinner and block interaction while an action is in flight. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      asChild = false,
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    // Slot requires a single child, so the spinner is only injected on a real
    // <button> (links passed via asChild don't have a loading state anyway).
    const content =
      loading && !asChild ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      );
    return (
      <Comp
        ref={ref}
        className={buttonVariants({ variant, size, className })}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {content}
      </Comp>
    );
  },
);
Button.displayName = "Button";
