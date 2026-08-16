import { defineConfig } from "vite";

export default defineConfig({
  base: "./",                    // relative paths so the build works in a Capacitor shell
  build: { outDir: "dist", target: "es2020" },
  test: { globals: true, environment: "node", include: ["src/**/*.test.ts"] },
} as any);
