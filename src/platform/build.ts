/**
 * Which build this is.
 *
 * `__BUILD__` is replaced at bundle time (see vite.config.ts) with the commit it was built
 * from. Under the test runner and anywhere the define is missing it falls back, so nothing
 * here can ever throw on a missing global.
 */
declare const __BUILD__: string | undefined;

export const BUILD: string = typeof __BUILD__ === "string" ? __BUILD__ : "dev";
