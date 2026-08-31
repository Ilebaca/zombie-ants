import { execSync } from "node:child_process";
// vitest/config, not vite: it is the one that also types the `test` block below, so the
// config needs no `as any` cast to carry both halves.
import { defineConfig } from "vitest/config";
import type { PluginContext } from "rollup";

/**
 * A stamp of what is actually running, shown on the Settings screen.
 *
 * Milan tests the deployed build on his phone, where a stale cached page and a real bug
 * look exactly alike from the outside. Being able to read the commit off the screen turns
 * "it does not work" into a one-line answer.
 */
const buildStamp = (): string => {
  try {
    const sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim();
    const day = new Date().toISOString().slice(0, 10);
    return `${sha} · ${day}`;
  } catch {
    return "dev";
  }
};

const STAMP = buildStamp();

export default defineConfig({
  base: "./",                    // relative paths so the build works in a Capacitor shell
  define: { __BUILD__: JSON.stringify(STAMP) },
  plugins: [{
    // The same stamp, as a file the running app can ask for. Pages caches the HTML, so a
    // device can sit on the previous bundle for minutes after a deploy; this is what lets
    // the app notice and take the new one (src/platform/freshness.ts).
    name: "zombie-ants:version-file",
    generateBundle(this: PluginContext) {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ build: STAMP }),
      });
    },
  }],
  build: { outDir: "dist", target: "es2020" },
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    // The engine is pure and runs fastest with no DOM at all; only the screens need one,
    // so jsdom is switched on per directory rather than globally.
    environment: "node",
    /*
     * jsdom where a test needs a DOM. The screens obviously do — and so does the board
     * RENDERER, which owns a canvas, a ResizeObserver and an animation frame, and was the
     * one file in `render/` with no test at all because of it. The rest of `render/` is
     * pure drawing against a recorded context and stays in node, which is faster.
     */
    environmentMatchGlobs: [
      ["src/ui/**", "jsdom"],
      ["src/render/__tests__/renderer.test.ts", "jsdom"],
    ],
  },
});
