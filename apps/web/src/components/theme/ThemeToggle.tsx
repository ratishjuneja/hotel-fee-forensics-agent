"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useTheme, type Theme } from "./ThemeProvider";

const ORDER: Theme[] = ["light", "dark", "system"];
const ICON = { light: Sun, dark: Moon, system: Monitor } as const;

/** Cycles light → dark → system. Icon reflects the current choice. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Stable placeholder before hydration so server/client markup matches.
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon-sm" aria-hidden tabIndex={-1}>
        <Monitor className="h-[1.05rem] w-[1.05rem]" />
      </Button>
    );
  }

  const Icon = ICON[theme];
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(next)}
      title={`Theme: ${theme}. Switch to ${next}.`}
      aria-label={`Switch theme, currently ${theme}`}
    >
      <Icon className="h-[1.05rem] w-[1.05rem]" />
    </Button>
  );
}
