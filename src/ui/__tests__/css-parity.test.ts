/**
 * game.css must stay a verbatim copy of the legacy build's <style> block.
 *
 * The screens are styled entirely by that stylesheet, so any edit made to one file and not
 * the other silently reintroduces the drift this copy was made to end (CLAUDE.md §1).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read from disk, not through Vite: an `import ... ?raw` of a .css file comes back through
// the CSS pipeline with comments already stripped, which would compare a processed copy.
const LEGACY = "legacy/zombie-ants-pro.html";
const PORTED = "src/ui/game.css";

/** The stylesheet as the legacy build declares it. */
function legacyStyleBlock(): string {
  const html = readFileSync(LEGACY, "utf8");
  const open = html.indexOf("<style>");
  const close = html.indexOf("</style>", open);
  expect(open, "legacy build has no <style> block").toBeGreaterThan(-1);
  expect(close, "legacy <style> block is unterminated").toBeGreaterThan(open);
  return html.slice(open + "<style>".length, close);
}

/** Our copy, minus the header comment that explains where it came from. */
function portedStyles(): string {
  const css = readFileSync(PORTED, "utf8");
  const end = css.indexOf("*/");
  expect(end, "game.css is missing its provenance header").toBeGreaterThan(-1);
  return css.slice(end + 2);
}

const lines = (s: string): string[] => s.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());

describe("stylesheet parity with the legacy build", () => {
  it("carries every line of the legacy stylesheet, unchanged and in order", () => {
    const want = lines(legacyStyleBlock());
    const got = lines(portedStyles());
    // Compared line by line: a mismatch report names the exact rule that drifted, which a
    // single whole-file diff would bury.
    expect(got.length, "line count differs — a rule was added or dropped").toBe(want.length);
    for (let i = 0; i < want.length; i++) {
      expect(got[i], `line ${i + 1} differs from the legacy stylesheet`).toBe(want[i]);
    }
  });

  it("keeps the faction colours the canvas reads back through getComputedStyle", () => {
    // The renderer resolves --you/--ai/--hive at runtime; losing one silently greys the board.
    const css = portedStyles();
    for (const token of ["--you:", "--ai:", "--hive:", "--gold:", "--panel:", "--line:"]) {
      expect(css, `${token} missing from the stylesheet`).toContain(token);
    }
  });
});
