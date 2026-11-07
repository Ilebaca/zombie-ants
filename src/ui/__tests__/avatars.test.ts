/**
 * THE FACES ON SCREEN — the folder that is the table, the picker, and the two places an
 * avatar is paid out.
 *
 * The art half is checked from BOTH ENDS, which is the rule every folder-is-the-table in
 * this app follows: every id the catalogue names has a file, and every file in the
 * folder belongs to an id. One without the other passes against a folder holding nothing
 * and against a folder full of pictures nothing can ever show.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  AVATAR_IDS, DEFAULT_AVATAR, FREE_AVATARS, HATCH_AVATARS, ROAD_AVATARS,
  ROAD_CHAPTER_STOPS, avatarName, freeReward,
} from "../../platform";
import { MemoryStore, ProfileStore } from "../../platform";
import { avatarArt, avatarsPainted } from "../avatars";
import { buildAvatarPicker } from "../avatarpicker";
import { buildColonyRoad } from "../road";
import { buildHatch } from "../hatch";

// jsdom has no canvas, and the drawn fallback asks for one. Returning null is also
// proof the screens survive a context the browser refused (§6).
HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });

const store = (): ProfileStore => new ProfileStore(new MemoryStore());

describe("the folder is the table", () => {
  it("has a painting for every avatar the catalogue names", () => {
    for (const id of AVATAR_IDS) {
      expect(avatarArt(id), `${id} is in the table with no file`).toBeTruthy();
    }
  });

  /**
   * ...AND NOTHING IN THE FOLDER THAT BELONGS TO NOBODY. A file no id names ships in the
   * bundle, is precached by the service worker and can never be shown — and because
   * `avatarArt` answers null rather than throwing, nothing else would ever say so.
   */
  it("has no painting that belongs to no avatar", () => {
    expect(avatarsPainted()).toBe(AVATAR_IDS.length);
  });

  it("answers null for an id it has never heard of", () => {
    expect(avatarArt("av9999")).toBeNull();
    expect(avatarArt("fire")).toBeNull();
  });
});

describe("the picker", () => {
  const build = (s: ProfileStore): HTMLElement => {
    const root = buildAvatarPicker(s, { onBack: () => {} });
    document.body.replaceChildren(root);
    return root;
  };

  /**
   * A LOCKED ONE IS DRAWN, which is the whole reason a collection is a collection: the
   * ninety-odd still to find are what make walking the road worth doing. The grid is
   * every avatar there is, not every one the player has.
   */
  it("draws every avatar, locked ones included", () => {
    const root = build(store());
    const tiles = root.querySelectorAll<HTMLButtonElement>(".av-t");
    expect(tiles.length).toBe(AVATAR_IDS.length);
    expect(root.querySelectorAll(".av-t.off").length).toBe(AVATAR_IDS.length - FREE_AVATARS.length);
  });

  /**
   * THE COUNT IS PRINTED ONCE, directly over the grid it counts.
   *
   * It was printed twice — above the hero and again above the tiles — reported as
   * "collection 23/98 two times, remove the top one, keep one directly above the
   * icons". A number said twice on one screen reads as two different numbers until
   * somebody checks.
   */
  it("counts the collection once, over the grid", () => {
    const root = build(store());
    const heads = Array.from(root.querySelectorAll(".secthead"))
      .filter((h) => (h.textContent ?? "").startsWith("Collected"));
    expect(heads.length, "the count is printed twice again").toBe(1);
    expect(heads[0]?.textContent)
      .toBe(`Collected ${FREE_AVATARS.length} of ${AVATAR_IDS.length}`);
    // ...and it is the LAST thing before the grid, which is what "directly above" means.
    expect(heads[0]?.nextElementSibling?.classList.contains("avgrid")).toBe(true);
  });

  /**
   * AND THE LINE UNDER THE HERO IS THE FACE'S NAME, not where it came from.
   *
   * Asked for directly: "instead of the road name it has to be the name of the icon."
   * The hero is the one being WORN, so how it is come by is a fact the player has
   * already settled; the tiles still carry the source, which is where a locked face
   * needs it.
   */
  it("names the face under the hero", () => {
    const s = store();
    const root = build(s);
    expect(root.querySelector(".av-hero-k")?.textContent).toBe(avatarName(s.face));
    const worn = FREE_AVATARS[2] as string;
    root.querySelector<HTMLButtonElement>(`.av-t[data-av="${worn}"]`)?.click();
    expect(root.querySelector(".av-hero-k")?.textContent).toBe(avatarName(worn));
  });

  /** A tile is a picture with no words, so its NAME leads and the source follows. */
  it("names every tile and still says where it comes from", () => {
    const root = build(store());
    const locked = root.querySelector(`.av-t[data-av="${ROAD_AVATARS[0]}"]`);
    const label = locked?.getAttribute("aria-label") ?? "";
    expect(label).toContain(avatarName(ROAD_AVATARS[0] as string));
    expect(label).toContain("Colony Road");
  });

  /** A locked tile is DISABLED rather than refusing on tap — one mechanism, and a visible one. */
  it("will not let a locked one be worn", () => {
    const root = build(store());
    const locked = root.querySelector<HTMLButtonElement>(`.av-t[data-av="${ROAD_AVATARS[0]}"]`);
    expect(locked?.disabled).toBe(true);
  });

  it("wears one on a tap", () => {
    const s = store();
    const id = FREE_AVATARS[1] as string;
    const root = build(s);
    root.querySelector<HTMLButtonElement>(`.av-t[data-av="${id}"]`)?.click();
    expect(s.avatar).toBe(id);
    expect(s.face).toBe(id);
    expect(root.querySelector(`.av-t[data-av="${id}"]`)?.classList.contains("on")).toBe(true);
  });

  /**
   * THE DEFAULT IS STORED BY CLEARING THE FIELD, never by writing its id — the rule
   * wearing a basic look already follows. The two states look identical on screen, so a
   * save that could spell them two ways is two states to keep in step.
   */
  it("stores the one every colony starts with as no choice at all", () => {
    const s = store();
    const root = build(s);
    expect(s.avatar, "a new colony has chosen something").toBeNull();
    expect(s.face, "a new colony wears nothing").toBe(DEFAULT_AVATAR);
    // ...and it reads as worn in the grid, because it is what is on screen.
    expect(root.querySelector(`.av-t[data-av="${DEFAULT_AVATAR}"]`)?.classList.contains("on"))
      .toBe(true);

    root.querySelector<HTMLButtonElement>(`.av-t[data-av="${FREE_AVATARS[1]}"]`)?.click();
    expect(s.avatar).toBe(FREE_AVATARS[1]);
    root.querySelector<HTMLButtonElement>(`.av-t[data-av="${DEFAULT_AVATAR}"]`)?.click();
    expect(s.avatar, "choosing the default wrote its id down").toBeNull();
    expect(s.face).toBe(DEFAULT_AVATAR);
  });

  /**
   * EVERY LOCKED ONE SAYS WHERE IT COMES FROM. A collection that will not say how a
   * thing is got is a collection a player cannot play toward — and there are three
   * different answers, so a single wording would be wrong for two thirds of them.
   */
  it("says where each one comes from", () => {
    const root = build(store());
    const label = (id: string): string =>
      root.querySelector(`.av-t[data-av="${id}"]`)?.getAttribute("aria-label") ?? "";
    expect(label(FREE_AVATARS[0] as string)).toContain("Yours from the start");
    expect(label(ROAD_AVATARS[0] as string)).toContain("chapter 1");
    expect(label(ROAD_AVATARS[49] as string)).toContain("chapter 50");
    expect(label(HATCH_AVATARS[0] as string)).toContain("Lucky hatch");
  });

  it("counts the collection in its own header", () => {
    const s = store();
    s.findAvatar(HATCH_AVATARS[0] as string);
    expect(build(s).textContent).toContain(`${FREE_AVATARS.length + 1} of ${AVATAR_IDS.length}`);
  });

  it("tells a young colony when the hatch opens", () => {
    expect(build(store()).querySelector(".av-note")?.textContent)
      .toContain("the lucky hatch opens at chapter");
    const grown = store();
    grown.update((p) => { p.colony = 2_000_000; });
    expect(build(grown).querySelector(".av-note")?.textContent)
      .not.toContain("the lucky hatch opens at chapter");
  });
});

describe("the road pays one a chapter", () => {
  /**
   * THE CHECKPOINT WEARS THE FACE IT PAYS, rather than a mark standing for it. Every
   * other disc on this road carries the mark of a resource because a resource has no
   * picture; an avatar is nothing but a picture, so a badge here would be the one
   * checkpoint refusing to show what it is giving.
   */
  it("draws the face on the checkpoint that pays it", () => {
    const s = store();
    s.update((p) => { p.colony = 2_000_000; });
    const root = buildColonyRoad(s, () => {}, () => {});
    document.body.replaceChildren(root);
    const faces = root.querySelectorAll(".rd-prize.avprize");
    expect(faces.length, "one avatar checkpoint per chapter").toBe(ROAD_AVATARS.length);
    for (const disc of Array.from(faces)) {
      expect(disc.querySelector(".rd-face"), "an avatar checkpoint with no face on it")
        .toBeTruthy();
    }
    // AND EACH ONE IS NAMED, like every other checkpoint says what it pays. "A new
    // avatar" was the road declining to say WHICH, on the one reward with a name of its
    // own. Compared against the fifty names the road really pays rather than against
    // the SHAPE of a name — a label that merely looked like one would pass that. Sorted,
    // because the screen's own order is the road's and is not this list's business.
    expect(Array.from(faces).map((d) => d.getAttribute("aria-label")).sort())
      .toEqual(ROAD_AVATARS.map((id) => avatarName(id)).sort());
  });

  /** And claiming it is what puts it in the collection. */
  it("hands the face over when the checkpoint is claimed", () => {
    const s = store();
    s.update((p) => { p.colony = 2_000_000; });
    const key = `f${ROAD_CHAPTER_STOPS * 0 + 3}`;
    expect(freeReward(3)?.avatar).toBe(ROAD_AVATARS[0]);
    expect(s.hasAvatar(ROAD_AVATARS[0] as string)).toBe(false);
    expect(s.claimRoad(key)).toBe(true);
    expect(s.hasAvatar(ROAD_AVATARS[0] as string), "the claim paid no face").toBe(true);
  });

  /** One write: a player who closes the app mid-claim never banks the key and not the face. */
  it("does not claim the key without paying the face", () => {
    const s = store();
    s.update((p) => { p.colony = 2_000_000; });
    s.claimRoad("f3");
    expect(s.get().roadClaimed).toContain("f3");
    expect(s.avatars).toContain(ROAD_AVATARS[0]);
  });
});

/**
 * THE LEGACY SHEET OWNS `.avatar`, AND IT IS A 40px DISC.
 *
 * `game.css` line 214 is `.avatar { width: 40px; height: 40px; border-radius: 50% }` — so
 * that string is STYLING, not a label (§10), and borrowing it as a modifier is what
 * collapsed the ten-hatch card's avatar rows to a 40px circle with both lines of text at
 * zero width. The two boxes that happened to survive it (`.hatchprize`, `.rd-prize`) only
 * did so because `skin.css` sets their own size LATER; that is luck, not a rule.
 *
 * Nothing a jsdom test can measure would ever notice — there is no layout here, and the
 * markup is identical either way. What a test CAN hold is the string.
 */
describe("the legacy .avatar class", () => {
  const loaded = (): ProfileStore => {
    const s = store();
    s.update((p) => { p.colony = 2_000_000; p.larva = 20; });
    return s;
  };

  /**
   * THE HATCH IS IN HERE, and that is the half the first version of this test missed:
   * walking the picker and the road alone passed against the very markup that was broken
   * — the collapsed rows are built by the TEN-card, so the mutation has to be reachable.
   */
  const screens = (): HTMLElement[] => {
    const picker = buildAvatarPicker(loaded(), { onBack: () => {} });
    const road = buildColonyRoad(loaded(), () => {}, () => {});
    // BOTH CARDS, because they are different markup: one roll is the tier's colour
    // filling the screen and ten is a table of rows, so a mutation in one is invisible
    // to a test that only presses the other.
    const rolled = (id: string): HTMLElement => {
      const h = buildHatch(loaded(), {
        onBack: () => {}, onBuyLarva: () => {}, onInventory: () => {},
        onProfile: () => {}, onChanged: () => {}, random: () => 0.5,
      });
      document.body.replaceChildren(h);
      vi.useFakeTimers();
      try {
        h.querySelector<HTMLButtonElement>(`#${id}`)?.click();
        vi.advanceTimersByTime(2000);
      } finally { vi.useRealTimers(); }
      return h;
    };
    return [picker, road, rolled("hatchGo"), rolled("hatchGo10")];
  };

  it("is never borrowed as a modifier by anything the faces build", () => {
    for (const root of screens()) {
      document.body.appendChild(root);
      const borrowed = Array.from(root.querySelectorAll(".avatar"));
      expect(
        borrowed.map((n) => n.className),
        `${root.id} borrows the legacy 40px disc`,
      ).toEqual([]);
      root.remove();
    }
  });
});
