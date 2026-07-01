import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/poker/**/*.ts"],
      exclude: ["src/lib/poker/**/*.{test,spec}.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "./src/lib/testing/server-only-shim.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
