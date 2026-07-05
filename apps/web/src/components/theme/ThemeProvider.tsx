"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Lightweight two-mode theme system (no next-themes dependency). Persists the
 * user's choice — "light" | "dark" — and reflects it as a `.dark` class on
 * <html>. The first paint is handled by {@link themeScript} injected in <head>,
 * so there is no flash before hydration.
 *
 * Light is the default: a first-time visitor always starts in light mode,
 * regardless of their OS setting, until they flip the toggle.
 */
export type Theme = "light" | "dark";

const STORAGE_KEY = "bb-theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Flip between light and dark. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Inline, render-blocking script that applies the stored theme before the first
 * paint. Only a stored "dark" yields dark; anything else (no value, legacy
 * values, "light") resolves to light. Mirror any change here in {@link apply}.
 * Injected once in the document <head>.
 */
export const themeScript = `(function(){try{var d=localStorage.getItem('${STORAGE_KEY}')==='dark';document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

function apply(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  // Hydrate from storage on mount and keep <html> in sync.
  useEffect(() => {
    const next: Theme =
      localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
    setThemeState(next);
    apply(next);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
    apply(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggle }),
    [theme, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
