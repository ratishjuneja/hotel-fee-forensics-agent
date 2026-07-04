import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Enterprise navy used for the shell + primary accents.
        brand: {
          50: "#eef2f8",
          100: "#d6e0ee",
          200: "#adc0dc",
          300: "#7f9cc7",
          400: "#5478b0",
          500: "#365a94",
          600: "#294776",
          700: "#213a61",
          800: "#1a2e4d",
          900: "#12213a",
          950: "#0b1526",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Inter",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "monospace"],
      },
    },
  },
  plugins: [typography],
};

export default config;
