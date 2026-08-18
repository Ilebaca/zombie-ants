import { defineConfig } from "vite";

export default defineConfig({
  base: "./",                    // relative paths so the build works in a Capacitor shell
  build: { outDir: "dist", target: "es2020" },
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    // The engine is pure and runs fastest with no DOM at all; only the screens need one,
    // so jsdom is switched on per directory rather than globally.
    environment: "node",
    environmentMatchGlobs: [["src/ui/**", "jsdom"]],
  },
} as any);
