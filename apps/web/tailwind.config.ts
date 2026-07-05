import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

/**
 * FeeForensics design tokens.
 *
 * Colors resolve to CSS custom properties (see globals.css) as HSL channel
 * triplets so Tailwind's `<alpha-value>` opacity modifier keeps working
 * (`bg-primary/10`). Every semantic token has a light AND a dark value, so the
 * whole UI themes from one class on <html>. Findings keep their severity
 * semantics: high = danger (rose), medium = warning (amber), low/review = muted.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "72rem" },
    },
    extend: {
      colors: {
        // Structural surfaces + text
        background: "hsl(var(--background) / <alpha-value>)",
        surface: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          2: "hsl(var(--surface-2) / <alpha-value>)",
          3: "hsl(var(--surface-3) / <alpha-value>)",
        },
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        subtle: "hsl(var(--subtle) / <alpha-value>)",
        border: {
          DEFAULT: "hsl(var(--border) / <alpha-value>)",
          strong: "hsl(var(--border-strong) / <alpha-value>)",
        },
        ring: "hsl(var(--ring) / <alpha-value>)",

        // Accent + state
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          hover: "hsl(var(--primary-hover) / <alpha-value>)",
          soft: "hsl(var(--primary-soft) / <alpha-value>)",
          "soft-foreground": "hsl(var(--primary-soft-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          foreground: "hsl(var(--success-foreground) / <alpha-value>)",
          soft: "hsl(var(--success-soft) / <alpha-value>)",
          "soft-foreground": "hsl(var(--success-soft-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
          soft: "hsl(var(--warning-soft) / <alpha-value>)",
          "soft-foreground": "hsl(var(--warning-soft-foreground) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "hsl(var(--danger) / <alpha-value>)",
          foreground: "hsl(var(--danger-foreground) / <alpha-value>)",
          soft: "hsl(var(--danger-soft) / <alpha-value>)",
          "soft-foreground": "hsl(var(--danger-soft-foreground) / <alpha-value>)",
        },

        /**
         * Legacy brand ramp — retuned to the refined blue so screens still
         * mid-migration onto semantic tokens stay on-palette in light mode.
         * New code should prefer the semantic tokens above.
         */
        brand: {
          50: "#eef3ff",
          100: "#dce7ff",
          200: "#bcd0ff",
          300: "#8fb0ff",
          400: "#5f88f7",
          500: "#3a63e8",
          600: "#2851c4",
          700: "#2242a0",
          800: "#233c86",
          900: "#20366d",
          950: "#141f40",
        },
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // Deliberate type scale (px in comment) with paired line-heights.
        xs: ["0.75rem", { lineHeight: "1rem" }], // 12
        sm: ["0.875rem", { lineHeight: "1.25rem" }], // 14
        base: ["1rem", { lineHeight: "1.5rem" }], // 16
        lg: ["1.125rem", { lineHeight: "1.6rem" }], // 18
        xl: ["1.25rem", { lineHeight: "1.7rem" }], // 20
        "2xl": ["1.5rem", { lineHeight: "1.9rem", letterSpacing: "-0.01em" }], // 24
        "3xl": ["1.875rem", { lineHeight: "2.2rem", letterSpacing: "-0.02em" }], // 30
        "4xl": ["2.25rem", { lineHeight: "2.5rem", letterSpacing: "-0.025em" }], // 36
        "5xl": ["3rem", { lineHeight: "1.05", letterSpacing: "-0.03em" }], // 48
        "6xl": ["3.75rem", { lineHeight: "1.02", letterSpacing: "-0.035em" }], // 60
      },
      boxShadow: {
        xs: "0 1px 2px 0 hsl(var(--shadow) / 0.05)",
        sm: "0 1px 2px -1px hsl(var(--shadow) / 0.08), 0 1px 3px 0 hsl(var(--shadow) / 0.06)",
        md: "0 2px 4px -2px hsl(var(--shadow) / 0.08), 0 6px 16px -4px hsl(var(--shadow) / 0.10)",
        lg: "0 8px 24px -6px hsl(var(--shadow) / 0.16), 0 2px 6px -2px hsl(var(--shadow) / 0.08)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "fade-up": "fade-up 0.3s ease-out both",
        "slide-in-right": "slide-in-right 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
        "scale-in": "scale-in 0.15s ease-out",
      },
    },
  },
  plugins: [typography],
};

export default config;
