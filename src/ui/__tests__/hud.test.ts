/**
 * THE PAINTED CHROME MARKS.
 *
 * `ui/hud.ts` is a folder-is-the-table glob, the same shape the home artwork, the region
 * grounds and the colony covers all use — so the thing worth holding is not which files
 * exist today (they are arriving a batch at a time) but that the TABLE still works: a
 * name with a file answers a painting, a name without one answers the drawing it always
 * answered, and nothing in between.
 *
 * That second half is the one that matters. A chrome that half-renders — a painted tab
 * bar over drawn currency chips — is a screen mid-way through a redesign, and the only
 * reason it is safe to ship one is that a missing file is a fallback rather than a hole.
 */
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { hudIcon, hudPainted } from "../hud";
import { hudMark } from "../chrome";
import { NAV_TABS } from "../chrome";

const FOLDER = resolve(__dirname, "..", "hud");

describe("the painted chrome marks", () => {
  const files = readdirSync(FOLDER).filter((f) => f.endsWith(".webp"));

  it("finds every file in the folder", () => {
    expect(hudPainted(), "the glob and the folder disagree").toBe(files.length);
    for (const f of files) {
      const name = f.replace(/\.webp$/, "");
      expect(hudIcon(name), `${name} is in the folder and not in the table`).toBeTruthy();
    }
  });

  /** The five tabs are the batch that has landed, and they are the whole bar — a bar
   *  with four painted tiles and one drawn one is the worst of both. */
  it("has one for every tab", () => {
    for (const [, mark] of NAV_TABS) {
      expect(hudIcon(mark), `the ${mark} tab has no painted mark`).toBeTruthy();
    }
  });

  it("answers nothing for a name with no file", () => {
    expect(hudIcon("no-such-mark")).toBeNull();
  });

  /**
   * AND THE TAG FOLLOWS THE FILE. An `<img>` where the mark is painted and an `<svg>`
   * where it is drawn — which is why every box that holds one sizes both (`css-sanity`).
   */
  it("gives a painting an img and a drawing an svg", () => {
    const painted = hudMark("home", 40);
    expect(painted.tagName.toLowerCase()).toBe("img");
    expect((painted as HTMLImageElement).width).toBe(40);
    // It is decoration inside a button that is already named, so it says nothing itself.
    expect(painted.getAttribute("alt")).toBe("");

    const drawn = hudMark("no-such-mark", 40);
    expect(drawn.tagName.toLowerCase()).toBe("svg");
  });

  /**
   * THE DRAWN FALLBACK KEEPS ITS OWN SIZE. A painted mark nearly fills its tile and a
   * flat glyph at that size is a burger with no button round it, so the two numbers are
   * separate — and the second one is only read when there is no file.
   */
  it("sizes a drawing by the number written for a drawing", () => {
    const drawn = hudMark("no-such-mark", 36, 26);
    expect(drawn.getAttribute("width")).toBe("26");
    const painted = hudMark("home", 36, 26);
    expect((painted as HTMLImageElement).width, "the painted one took the drawn size")
      .toBe(36);
  });
});
