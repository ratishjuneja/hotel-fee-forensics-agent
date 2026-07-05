"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useTheme } from "./ThemeProvider";

/** Binary Light ↔ Dark switch. Icon shows the current mode; click to flip. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Stable placeholder before hydration so server/client markup matches.
  // Default is light, so the placeholder is the Sun.
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon-sm" aria-hidden tabIndex={-1}>
        <Sun className="h-[1.05rem] w-[1.05rem]" />
      </Button>
    );
  }

  const isDark = theme === "dark";
  const Icon = isDark ? Moon : Sun;
  const next = isDark ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
    >
      <Icon className="h-[1.05rem] w-[1.05rem]" />
    </Button>
  );
}
