/**
 * NO EMOJI IN THE CHROME.
 *
 * The single loudest "unconsidered" signal an interface can carry: a cart, a plant pot, a
 * dartboard and a house in one row, each from a different illustrator, at a different
 * weight, rendered differently on every platform. `src/ui/icons.ts` is one family of solid
 * marks on a 24 grid and the app uses those (CLAUDE.md §10).
 *
 * Every screen was cleaned by hand and NOTHING GUARDED IT, which is exactly why the match
 * screen's action bar — the one a player spends the whole game looking at — still carried
 * five of them, and the board drew a shield emoji into the canvas. This test is the guard.
 *
 * Comments are exempt: the reason a mark was replaced is worth writing down, and writing it
 * down means naming the glyph.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Pictographs and dingbats — a picture standing in for a mark.
 *
 * Deliberately NOT every non-ASCII character. The copy is full of en dashes, arrows,
 * multiplication signs and accented names, and those are TYPOGRAPHY: "Granary → Lv 3" is
 * a sentence with an arrow in it, not an icon somebody could not be bothered to draw.
 */
// U+FE0F (the variation selector that turns a glyph into an emoji) is matched separately:
// inside the class it combines with the preceding range and eslint rightly objects.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}]|\u{FE0F}/u;

/** Everything the app ships, minus the tests that describe it. */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "__tests__") sources(path, out);
    } else if (name.endsWith(".ts") || name.endsWith(".css")) {
      out.push(path);
    }
  }
  return out;
}

/** A line with the glyph inside a comment is documenting it, not drawing it. */
const isComment = (line: string): boolean => {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
};

describe("the chrome", () => {
  it("draws every mark, and types none of them", () => {
    const offenders: string[] = [];
    for (const file of sources("src")) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (!isComment(line) && EMOJI.test(line)) {
          offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 80)}`);
        }
      });
    }
    expect(offenders, `an emoji reached the interface:\n${offenders.join("\n")}`).toEqual([]);
  });

  // The legacy stylesheet is a verbatim copy and is exempt from everything else, but it is
  // the ONE file this rule cannot skip: a glyph in a `content:` rule draws on screen.
  it("covers the legacy stylesheet too", () => {
    expect(sources("src")).toContain(join("src", "ui", "game.css"));
  });
});
