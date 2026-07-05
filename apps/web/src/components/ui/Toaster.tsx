"use client";

import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "@/components/theme/ThemeProvider";

/** Re-export so app code imports the toast API from our UI layer. */
export { toast } from "sonner";

/** Themed sonner toaster, mounted once in the root layout. */
export function Toaster() {
  const { theme } = useTheme();
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      gap={10}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-xl !border !border-border !bg-surface !text-foreground !shadow-lg",
          title: "!text-sm !font-semibold !text-foreground",
          description: "!text-sm !text-muted",
          actionButton:
            "!rounded-md !bg-primary !text-primary-foreground !text-xs !font-semibold",
          cancelButton: "!rounded-md !bg-surface-2 !text-muted !text-xs",
          closeButton:
            "!border-border !bg-surface !text-muted hover:!text-foreground",
          success: "!text-success-soft-foreground",
          error: "!text-danger-soft-foreground",
          warning: "!text-warning-soft-foreground",
        },
      }}
    />
  );
}
