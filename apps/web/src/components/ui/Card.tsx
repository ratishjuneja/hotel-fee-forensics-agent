import { cn } from "@/lib/utils";

/**
 * Surface primitive replacing the ad-hoc `.card` utility. Card is a bare themed
 * surface with no padding; pass your own padding via className.
 */
export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-sm",
        interactive &&
          "transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-md",
        className,
      )}
      {...props}
    />
  );
}
