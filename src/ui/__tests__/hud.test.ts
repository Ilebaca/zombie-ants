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
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { hudIcon, hudPainted } from "../hud";
import { hudMark, RESOURCE_MARKS, resourceMark } from "../chrome";
import { NAV_TABS } from "../chrome";
import { MENU_ENTRIES } from "../screens-simple";
import { defaultProfile } from "../../platform";

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

  /** The five tabs are the whole bar — four painted tiles and one drawn one is the
   *  worst of both. */
  it("has one for every tab", () => {
    for (const [, mark] of NAV_TABS) {
      expect(hudIcon(mark), `the ${mark} tab has no painted mark`).toBeTruthy();
    }
  });

  /**
   * AND THE CHROME IS COMPLETE NOW, so this stops being a table of what has arrived and
   * becomes a table of what is OWED. For months a missing file was the ordinary case and
   * this test could only hold the tabs; with every mark painted, the fallback that made
   * shipping a batch at a time safe is the thing to guard AGAINST — a file lost in a
   * rename or a bad glob would quietly put one flat glyph in a row of paintings, which
   * is a screen that looks broken rather than one that looks unfinished.
   *
   * Written out rather than globbed off the folder: the folder IS the glob's input, so
   * a test that reads it would pass against a folder with one file in it. These are the
   * names the chrome actually asks `hudMark` for, from the three places that ask.
   */
  it("has one for every mark the chrome asks for", () => {
    const asked = new Set<string>([
      ...NAV_TABS.map(([, mark]) => mark),
      ...MENU_ENTRIES.map((e) => e.icon),
      // chrome.ts: the colony banner, the granary pill, the currency chips and the
      // stepper. app.ts: the three side buttons.
      "swords", "mycel", "pheromone", "plus", "menu", "calendar", "brood",
    ]);
    for (const mark of asked) {
      expect(hudIcon(mark), `the chrome asks for ${mark} and there is no file`)
        .toBeTruthy();
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

/**
 * A RESOURCE IS ALWAYS THE PAINTED MARK.
 *
 * The rule above — painted in the chrome, drawn in the body — holds for every mark that
 * names a SCREEN or an ACTION, and does not hold for a currency. Asked for directly:
 * "everywhere where we show resources their official icon should be like it is on the
 * home screen." The top bar is where a player learns what mycelium looks like, and a
 * price, a reward and a payout are the same object counted somewhere else; drawn flat in
 * nine places and painted in the tenth they read as two different currencies.
 *
 * The shop is the exception and already was: a purchase tile shows the SHELF art, a
 * painted pile of the stuff, which is a picture of what is bought rather than its mark.
 */
describe("the three resource marks", () => {
  /**
   * ONE MARK PER CURRENCY THE SAVE HOLDS, and that is what keeps the sweep below
   * honest: the sweep only guards the marks in this list, so dropping one from it is a
   * silent way to stop guarding it. (Mutation-checked: shrinking the list passed every
   * other assertion here.) The three purse fields are the vocabulary the list has to
   * cover — add a fourth currency and this fails until it has a mark.
   */
  it("names every currency the profile holds, and nothing else", () => {
    const purse = defaultProfile();
    const fields: Record<string, number> = {
      mycel: purse.mycel, pheromone: purse.pheromone, brood: purse.larva,
    };
    expect([...RESOURCE_MARKS].sort()).toEqual(Object.keys(fields).sort());
  });

  it("all have a painting, so `resourceMark` never falls back", () => {
    for (const mark of RESOURCE_MARKS) {
      expect(hudIcon(mark), `${mark} is a resource with no painted file`).toBeTruthy();
      expect(resourceMark(mark, 16).tagName.toLowerCase(),
        `${mark} came back as a drawing`).toBe("img");
    }
  });

  /**
   * AND NO SHIPPED SCREEN MAY DRAW ONE INSTEAD.
   *
   * This is the half a rendering test cannot see: `icon("mycel", 13)` produces a
   * perfectly good mark, in the wrong family, on one card out of ten. The sweep is the
   * rule — a reviewer reading one file cannot tell whether the other nine agree.
   */
  it("are never drawn with `icon()` anywhere in the app", () => {
    const dir = resolve(__dirname, "..");
    const offenders: string[] = [];
    const walk = (at: string): void => {
      for (const entry of readdirSync(at, { withFileTypes: true })) {
        if (entry.name === "__tests__") continue;
        const full = resolve(at, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith(".ts")) continue;
        const src = readFileSync(full, "utf8");
        for (const mark of RESOURCE_MARKS) {
          if (src.includes(`icon("${mark}"`)) offenders.push(`${entry.name}: icon("${mark}")`);
        }
      }
    };
    walk(dir);
    expect(offenders, "a resource was drawn rather than painted").toEqual([]);
  });
});
