import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests import { describe, it, expect } from "vitest" explicitly (globals off).
    include: ["src/**/*.test.ts"],
  },
});
