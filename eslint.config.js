/**
 * Lint rules, and only the ones that catch a real bug class.
 *
 * The type checker already runs on every build (`strict`, `noUncheckedIndexedAccess`,
 * `noUnusedLocals`), so this file deliberately does NOT re-litigate style — there is no
 * formatter fight to have here. What it adds is the handful of checks TypeScript cannot
 * make: promises that nobody waits for, a `case` that falls into the next one, an equality
 * test that coerces, and — the one that matters most in this codebase — the ARCHITECTURE.
 *
 * The layering in CLAUDE.md §3 is the reason the AI can search thousands of futures safely
 * and the reason animation work cannot break a game rule. It was held by review alone; it
 * is held by `no-restricted-imports` now, so a wrong import fails rather than being noticed.
 */
import js from "@eslint/js";
import ts from "typescript-eslint";

/**
 * One layer's rule: which other layers it may never reach for.
 *
 * Both spellings of each, because a barrel is imported as `../platform` and a file inside
 * it as `../platform/colony` — matching only the second lets the barrel straight through,
 * which is the import almost everyone writes.
 */
const forbid = (...layers) => ({
  "no-restricted-imports": ["error", {
    patterns: layers.flatMap((l) => [`**/${l}`, `**/${l}/*`, `**/${l}/**`]),
  }],
});

export default ts.config(
  { ignores: ["dist/**", "legacy/**", "node_modules/**", "android/**", "*.config.js", "tools/icons.ts"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      // The type checker owns unused code; its message is better and it runs on every build.
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "no-fallthrough": "error",
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  /*
   * THE ARCHITECTURE, enforced. Dependency direction is one way — ui → render → ai →
   * engine — and platform sits beside them, reachable from ui only.
   */
  {
    files: ["src/engine/**/*.ts"],
    // The engine imports NOTHING. That is what makes it replayable and safe to search.
    rules: {
      "no-restricted-imports": ["error", { patterns: ["../*", "../**"] }],
    },
  },
  {
    files: ["src/ai/**/*.ts"],
    rules: forbid("render", "ui", "platform"),
  },
  {
    files: ["src/render/**/*.ts"],
    rules: forbid("ui", "platform"),
  },
  {
    files: ["src/platform/**/*.ts"],
    rules: forbid("ui", "render", "ai"),
  },

  /*
   * The engine may not roll dice of its own: scatter draws from the seeded generator on
   * GameState, or the same seed stops replaying the same game (CLAUDE.md §4.1).
   */
  {
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-properties": ["error", {
        object: "Math", property: "random",
        message: "The engine is seeded. Use nextRandom/nextInt on GameState.rng (§4.1).",
      }],
    },
  },

  // Tests and tools measure things, print things, and reach across layers on purpose.
  {
    files: ["**/__tests__/**/*.ts", "tools/**/*.ts"],
    rules: {
      "no-console": "off",
      "no-restricted-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
