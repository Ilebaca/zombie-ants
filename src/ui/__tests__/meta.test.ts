/**
 * The progression screens, driven the way a player drives them.
 *
 * jsdom gives no canvas, so portraits come back null — that is deliberate: it proves the
 * screens survive a context they cannot draw into, which is the same failure mode as a
 * hidden tab (CLAUDE.md §10). Everything asserted here is structure and state, never looks.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  CHAMBER_MAX, DEF, HIVE_COOLDOWN, HIVE_GROW_EVERY, KEEP_NORMAL, MAPS, PROD, RESEARCH_MAX,
  SPECIES, TRAVEL_RANGE, chamberCost, researchCost,
} from "../../engine";
import type { SpeciesId } from "../../engine";
import {
  COLONY_START, GRANARY_LEVELS, GRANARY_MAX, MemoryStore, ProfileStore, ROAD_CHAPTER_STOPS,
  RESEARCH_TOTAL_MAX, SPECIES_UNLOCK, chapterOf, compact, granaryFull, roadKey, stopColony,
} from "../../platform";
import { buildAnthill } from "../anthill";
import { buildProfile } from "../profile";
import { clockOf, colonyBanner, granaryPill } from "../chrome";
import { buildAntarium } from "../antarium";
import { buildSpeciesPage } from "../species";
import type { EngineEvent } from "../../engine";
import { dayIndex, questDef } from "../../platform";
import { scoreQuestEvents } from "../../platform";
import { buildQuests } from "../quests";
import { buildColonyRoad } from "../road";
import { buildRules } from "../rules";

/**
 * A profile with exactly the balances a test asks for. Set explicitly rather than topped
 * up, because a new profile arrives with a starting grant of mycelium.
 */
const store = (mycel = 0, pheromone = 0, colony = COLONY_START): ProfileStore => {
  const s = new ProfileStore(new MemoryStore());
  s.update((p) => { p.mycel = mycel; p.pheromone = pheromone; p.colony = colony; });
  return s;
};

const click = (el: Element | null | undefined): void => {
  expect(el, "expected a clickable element").toBeTruthy();
  (el as HTMLElement).click();
};

/** The buy button on the card whose title matches. */
const buyIn = (root: HTMLElement, selector: string, name: string): HTMLButtonElement | null => {
  for (const cell of Array.from(root.querySelectorAll(selector))) {
    if (cell.textContent?.includes(name)) return cell.querySelector<HTMLButtonElement>(".buybtn");
  }
  return null;
};

// jsdom has no 2D context and logs a "not implemented" error for every portrait. Returning
// null is exactly what the screens must already handle, so make it explicit and quiet.
HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });

/** Open the chamber whose room button names it, and hand back its level row. */
const openRoom = (root: HTMLElement, name: string): HTMLElement | null => {
  for (const lvl of Array.from(root.querySelectorAll<HTMLElement>(".nest-lvl"))) {
    if (!lvl.querySelector(".room-nm")?.textContent?.includes(name)) continue;
    click(lvl.querySelector<HTMLButtonElement>(".room"));
    break;
  }
  return Array.from(root.querySelectorAll<HTMLElement>(".nest-lvl"))
    .find((l) => l.querySelector(".room-nm")?.textContent?.includes(name)) ?? null;
};

/**
 * THE ANTHILL IS A PLACE, so the screen is a picture of one.
 *
 * It was five cards down a page — an honest table of upgrades with nothing whatever to do
 * with an ant colony. It is a cross-section now: a shaft from the surface with a chamber
 * hollowed out at each level, opening where it sits.
 */
describe("anthill screen", () => {
  it("digs one level of the nest per chamber, in order", () => {
    const root = buildAnthill(store());
    const rooms = Array.from(root.querySelectorAll<HTMLElement>(".nest-lvl"));
    // The granary is the first room down and is NOT a chamber: it changes the colony
    // between matches rather than changing a match (platform/granary.ts).
    expect(rooms.length).toBe(Object.keys(CHAMBER_MAX).length + 1);
    expect(rooms[0]?.dataset.chamber).toBe("granary");
    expect(rooms[1]?.dataset.chamber).toBe("royal");
    expect(root.textContent).toContain("Royal Chamber");
    expect(root.textContent).toContain("LV 0/5");
    // Alternating sides, so the shaft reads as a tunnel branching rather than a list.
    expect(rooms.map((r) => (r.classList.contains("left") ? "L" : "R")).join(""))
      .toBe("LRLRLR");
  });

  /** Unbroken earth on one side, a hollowed-out room on the other. */
  it("tells a dug chamber from ground nobody has touched", () => {
    const s = store(100000);
    s.buyChamber("royal");
    const root = buildAnthill(s);
    const rooms = Array.from(root.querySelectorAll<HTMLElement>(".nest-lvl"));
    expect(rooms[1]?.className, "a dug chamber still read as earth").toContain("dug");
    expect(rooms[2]?.className, "untouched ground read as a room").toContain("fresh");
  });

  it("opens the chamber that is tapped, and only that one", () => {
    const root = buildAnthill(store());
    const gland = openRoom(root, "Metapleural Gland");
    expect(gland?.className, "the tapped chamber did not open").toContain("open");
    expect(gland?.querySelector(".room-open"), "nothing was in it").not.toBeNull();
    expect(root.querySelectorAll(".nest-lvl.open").length, "two chambers stood open").toBe(1);
    expect(gland?.querySelector(".room")?.getAttribute("aria-expanded")).toBe("true");
  });

  it("buys a level and re-renders with the new one", () => {
    const s = store(chamberCost(0));
    const root = buildAnthill(s);
    // The granary stands open on arrival, so a chamber has to be opened to reach its
    // price — only the open room carries a buy button.
    openRoom(root, "Royal Chamber");
    click(buyIn(root, ".nest-lvl", "Royal Chamber"));
    expect(s.get().hill.royal).toBe(1);
    expect(root.textContent).toContain("LV 1/5");
    // Spent down to nothing, so the button must now be dead rather than merely wrong.
    expect(buyIn(root, ".nest-lvl", "Royal Chamber")?.disabled).toBe(true);
  });

  /** Digging must not close the chamber the player is standing in. */
  it("leaves the chamber open after buying a level of it", () => {
    const s = store(100000);
    const root = buildAnthill(s);
    openRoom(root, "Brood Nursery");
    click(buyIn(root, ".nest-lvl", "Brood Nursery"));
    const open = root.querySelector<HTMLElement>(".nest-lvl.open");
    expect(open?.dataset.chamber, "the screen shut the room it just dug").toBe("brood");
  });

  it("does not spend when the player cannot afford the level", () => {
    const s = store(chamberCost(0) - 1);
    const root = buildAnthill(s);
    openRoom(root, "Royal Chamber");
    const btn = buyIn(root, ".nest-lvl", "Royal Chamber");
    expect(btn?.disabled).toBe(true);
    click(btn);                                  // a disabled button still takes the tap
    expect(s.get().hill.royal ?? 0).toBe(0);
    expect(s.get().mycel).toBe(chamberCost(0) - 1);
  });

  it("shows MAX instead of a price once a chamber is capped", () => {
    const s = store(100000);
    for (let i = 0; i < CHAMBER_MAX.royal; i++) s.buyChamber("royal");
    const root = buildAnthill(s);
    openRoom(root, "Royal Chamber");
    expect(buyIn(root, ".nest-lvl", "Royal Chamber")?.textContent).toBe("MAX");
    expect(root.querySelector('[data-chamber="royal"]')?.className).toContain("maxed");
  });

  /** The whole nest's progress, which the list could never say. */
  it("counts every level dug against every level there is", () => {
    const s = store(100000);
    s.buyChamber("royal");
    s.buyChamber("gland");
    // The granary counts too — it is a room in the same nest, and it starts on level one.
    const total = Object.values(CHAMBER_MAX).reduce((a, b) => a + b, GRANARY_MAX);
    expect(buildAnthill(s).querySelector(".nest-sum-v")?.textContent).toBe(`3 / ${total}`);
  });

  /* -------------------------------------------------------------- THE GRANARY */

  /**
   * THE COLONY GROWS WHILE NOBODY IS PLAYING.
   *
   * The room is dug here; the store is emptied on the home screen. What the room has to
   * get right is the gate — a level the road has not reached must say WHEN rather than
   * offering a price it would refuse.
   */
  // The rate is derived from what a victory pays — that is how it stays honest at every
  // colony size — but that is OUR reference. The player is told troops per hour and per
  // day; pricing one thing in another is not an explanation.
  it("opens on the granary, and states its rate in troops, never in wins", () => {
    const s = store(0, 0, 10_000);
    const root = buildAnthill(s);
    const open = root.querySelector<HTMLElement>(".nest-lvl.open");
    expect(open?.dataset.chamber).toBe("granary");
    const now = open?.querySelector(".che-now .che-v")?.textContent ?? "";
    const next = open?.querySelector(".che-next .che-v")?.textContent ?? "";
    expect(now).toContain("troops/hour");
    expect(now).toContain("a day");
    expect(root.textContent?.toLowerCase(), "the granary priced itself in wins").not.toContain("win");
    // The next level really is faster, or the comparison says nothing.
    const rate = (txt: string): number => Number(/\+([\d.]+)/.exec(txt)?.[1] ?? 0);
    expect(rate(next)).toBeGreaterThan(rate(now));
  });

  // A young colony forages a fraction of a troop an hour. Rounded to a whole number the
  // first level reads "+0/h", which looks broken rather than slow.
  it("writes a rate below one troop an hour as a fraction", () => {
    const root = buildAnthill(store());
    expect(root.querySelector(".che-now .che-v")?.textContent).toMatch(/\+\d\.\d troops\/hour/);
  });

  it("names the chapter that opens the next level instead of pricing it", () => {
    const s = store(100000);
    expect(chapterOf(s.get().colony)).toBeLessThan(GRANARY_LEVELS[1]!.chapter);
    const root = buildAnthill(s);
    const open = root.querySelector<HTMLElement>(".nest-lvl.open");
    expect(open?.querySelector(".glock")?.textContent)
      .toBe(`Chapter ${GRANARY_LEVELS[1]!.chapter}`);
    expect(open?.querySelector(".buybtn"), "priced a level the road has not reached")
      .toBeNull();
  });

  it("sells the next level once the chapter is open, and digs it", () => {
    const s = store(100000);
    s.update((p) => { p.colony = stopColony((GRANARY_LEVELS[1]!.chapter - 1) * ROAD_CHAPTER_STOPS + 1); });
    const root = buildAnthill(s);
    expect(root.querySelector(".glock"), "still gated with the chapter reached").toBeNull();
    click(root.querySelector<HTMLButtonElement>(".nest-lvl.open .buybtn"));
    expect(s.get().granary).toBe(2);
    expect(root.querySelector(".nest-lvl.open")?.textContent).toContain(`LV 2/${GRANARY_MAX}`);
  });

  /** "Now: X → Y" put the same sentence twice on one line. Two rows, one left edge. */
  it("states the level you have and the one you would buy as two rows", () => {
    const s = store(100000);
    s.buyChamber("royal");
    const room = openRoom(buildAnthill(s), "Royal Chamber");
    expect(room?.querySelector(".che-now .che-v")?.textContent)
      .toBe("+1 soldier in your base at match start");
    expect(room?.querySelector(".che-next .che-v")?.textContent)
      .toBe("+2 soldiers in your base at match start");
  });

  it("offers nothing to buy on a chamber that is finished", () => {
    const s = store(100000);
    for (let i = 0; i < CHAMBER_MAX.royal; i++) s.buyChamber("royal");
    const room = openRoom(buildAnthill(s), "Royal Chamber");
    expect(room?.querySelector(".che-next")).toBeNull();
    expect(room?.className).toContain("maxed");
  });

  /**
   * The word "MYCEL" after the figure named the currency its own mark already names, and it
   * was the widest thing in the header — which pushed the centred title off the middle.
   */
  it("shows the currency as a mark and a figure, not a word", () => {
    const chip = buildAnthill(store()).querySelector(".mycelchip");
    // The mark is an SVG, so the chip's text is the figure and nothing else.
    expect(chip?.textContent?.trim()).toBe("0");
    expect(chip?.querySelector("svg"), "the mark went with the word").not.toBeNull();
  });

  /** Nav tabs carry no back arrow — the bottom nav is the way out (legacy behaviour). */
  it("carries no back button, being a bottom-nav tab", () => {
    expect(buildAnthill(store()).querySelector(".backbtn")).toBeNull();
    expect(buildAntarium(store(), { onOpenSpecies: () => {} }).querySelector(".backbtn")).toBeNull();
  });
});

/** A stopwatch reads the same width whatever it says, which is why seconds pad. */
/**
 * THE PROFILE. The avatar used to open the Colony screen — a level badge and today's three
 * quests — so the one place a player goes to look at THEMSELVES showed a to-do list, while
 * every number the game kept about their career sat in the save and on no screen at all.
 */
describe("profile screen", () => {
  const nowhere = { onBack: () => {}, onColonies: () => {}, onChambers: () => {}, onQuests: () => {} };
  const played = (over: Partial<Record<string, number>> = {}): ProfileStore => {
    const s = store();
    s.update((p) => {
      Object.assign(p.stats, {
        games: 10, wins: 6, conquered: 120, abilities: 30, tunnels: 4,
        winStreak: 2, bestStreak: 5, turns: 300, playedMs: 1_800_000, bestMs: 214_000,
        queens: 3, nests: 2, ...over,
      });
    });
    return s;
  };

  it("reports the career, including what the save could never show", () => {
    const text = buildProfile(played(), nowhere).textContent ?? "";
    for (const said of ["Played", "10", "Won", "6", "Lost", "4", "Win rate", "60%",
      "Ground taken", "120", "Queens taken", "Time at the board", "30:00",
      "Fastest win", "3:34"]) {
      expect(text, `the profile never said "${said}"`).toContain(said);
    }
    // Still counted into the save, deliberately not reported. Each is a tally rather than
    // an achievement — a number that only goes up with time played, which the clock above
    // already says.
    for (const gone of ["Tunnels dug", "Nests cracked", "Abilities cast", "Turns played"]) {
      expect(text, `"${gone}" came back onto the profile`).not.toContain(gone);
    }
  });

  it("says nothing rather than zero for a win that has never happened", () => {
    const root = buildProfile(played({ bestMs: 0 }), nowhere);
    const cell = Array.from(root.querySelectorAll<HTMLElement>(".pf-stat"))
      .find((c) => c.querySelector(".pf-k")?.textContent === "Fastest win");
    expect(cell, "the fastest win is not reported at all").toBeTruthy();
    expect(cell?.querySelector(".pf-v")?.textContent,
      "a win that never happened was reported as a time").toBe("—");
  });

  it("counts a fresh player's record honestly", () => {
    const text = buildProfile(store(), nowhere).textContent ?? "";
    expect(text).toContain("Win rate");
    expect(text, "a rate out of no games").toContain("0%");
  });

  /** The collection block is the one with room in it: another thing to collect is a row. */
  it("shows the collection as counts against what there is to collect", () => {
    const s = store(100000);
    s.buyChamber("royal");
    const root = buildProfile(s, nowhere);
    const rows = Array.from(root.querySelectorAll<HTMLElement>(".pf-row-coll"));
    expect(rows.length, "the collection block is not there").toBe(3);
    expect(rows[0]?.textContent).toContain("Colonies");
    expect(rows[0]?.textContent).toContain(`/ ${Object.keys(SPECIES).length}`);
    expect(rows[1]?.textContent).toContain("Nest chambers");
    expect(rows[1]?.textContent, "the chamber just bought is not counted").toContain("1 / ");
    expect(rows[2]?.textContent).toContain("Research levels");
    // One head per colony, so the row says WHICH rather than only how many.
    expect(root.querySelectorAll(".pf-head").length).toBe(Object.keys(SPECIES).length);
  });

  it("opens the screen that fills each row", () => {
    const seen: string[] = [];
    const root = buildProfile(store(), {
      onBack: () => seen.push("back"),
      onColonies: () => seen.push("colonies"),
      onChambers: () => seen.push("chambers"),
      onQuests: () => seen.push("quests"),
    });
    const rows = Array.from(root.querySelectorAll<HTMLButtonElement>(".pf-row"));
    for (const r of rows) r.click();
    expect(seen).toEqual(["colonies", "chambers", "colonies", "quests"]);
  });

  /**
   * `.pname` is the legacy build's name INPUT — a bordered text field. Borrowing it drew a
   * box round the player's name, and `.qbar` has a height only inside `.qhero`, so the XP
   * bar was a track with none. Everything on this screen is prefixed for that reason.
   */
  it("uses its own class names, not the legacy sheet's", () => {
    const root = buildProfile(store(), nowhere);
    const classes = new Set(Array.from(root.querySelectorAll("*"))
      .flatMap((e) => Array.from(e.classList)));
    for (const legacy of ["pname", "qbar", "pk", "pv", "prow"]) {
      expect(classes.has(legacy), `.${legacy} belongs to the legacy stylesheet`).toBe(false);
    }
    expect(classes.has("pf-name"), "the profile lost its own name class").toBe(true);
  });
});

describe("the match clock", () => {
  it("reads like a clock, and keeps its width", () => {
    expect(clockOf(0)).toBe("0:00");
    expect(clockOf(7_000)).toBe("0:07");
    expect(clockOf(67_000)).toBe("1:07");
    expect(clockOf(600_000)).toBe("10:00");
    // Past an hour the minutes pad too, or "1:2:03" is not a time.
    expect(clockOf(3_723_000)).toBe("1:02:03");
  });

  it("rounds to the nearest second and never goes backwards", () => {
    expect(clockOf(1_400)).toBe("0:01");
    expect(clockOf(1_600)).toBe("0:02");
    expect(clockOf(-500), "a negative clock").toBe("0:00");
  });
});

describe("antarium collection", () => {
  const openAntarium = (store: ProfileStore): HTMLElement =>
    buildAntarium(store, { onOpenSpecies: () => {} });

  const cardFor = (root: HTMLElement, name: string): HTMLElement | undefined =>
    Array.from(root.querySelectorAll<HTMLElement>(".ccard")).find((c) => c.textContent?.includes(name));

  it("shows every species, grouped into the four rarity tiers", () => {
    const root = openAntarium(store());
    expect(root.querySelectorAll(".ccard").length).toBe(Object.keys(SPECIES).length);
    expect(root.querySelectorAll(".tierhead").length).toBe(4);
    expect(root.textContent).toContain("Founding castes");
    expect(root.textContent).toContain("Mythic");
  });

  it("counts owned colonies per tier", () => {
    const root = openAntarium(store());
    const heads = Array.from(root.querySelectorAll(".tierhead"));
    // The three founding castes are the ones a new profile owns.
    expect(heads[0]?.textContent).toContain("3/3");
    expect(heads[1]?.textContent).toContain("0/3");
  });

  it("veils a locked colony with its price and leaves owned ones open", () => {
    const root = openAntarium(store());
    const weaver = cardFor(root, "Weaver Ant");
    expect(weaver?.className).toContain("locked");
    expect(weaver?.querySelector(".cveil")?.textContent).toContain(String(SPECIES_UNLOCK.weaver));

    const fire = cardFor(root, "Fire Ant");
    expect(fire?.className).not.toContain("locked");
    expect(fire?.querySelector(".clv")?.textContent).toBe("LV 0");
  });

  it("re-points the banner and the call to action at the colony you tap", () => {
    const root = openAntarium(store());
    click(cardFor(root, "Bullet Ant"));
    expect(root.querySelector(".rb-name")?.textContent).toBe("Bullet Ant");
    expect(root.querySelector("#antCTA")?.textContent).toContain(String(SPECIES_UNLOCK.bullet));
    expect(root.querySelector(".rb-meta .lv")?.textContent).toContain("LOCKED");
  });

  it("opens an owned colony's page through the call to action", () => {
    let opened = "";
    const root = buildAntarium(store(), { onOpenSpecies: (id) => { opened = id; } });
    click(cardFor(root, "Carpenter"));
    expect(root.querySelector("#antCTA")?.textContent).toContain("Upgrade");
    click(root.querySelector("#antCTA"));
    expect(opened).toBe("carpenter");
  });

  it("buys a locked colony with mycelium and flips it to owned", () => {
    const s = store(SPECIES_UNLOCK.weaver);
    const root = buildAntarium(s, { onOpenSpecies: () => {} });
    click(cardFor(root, "Weaver Ant"));
    click(root.querySelector("#antCTA"));
    expect(s.isUnlocked("weaver")).toBe(true);
    expect(s.get().mycel).toBe(0);
    expect(cardFor(root, "Weaver Ant")?.className).not.toContain("locked");
  });

  /** Premium is a shop purchase (roadmap step 5) — soft currency must not reach it. */
  it("never sells a premium colony for mycelium", () => {
    const s = store(100000);
    const root = buildAntarium(s, { onOpenSpecies: () => {} });
    click(cardFor(root, "Demon Ant"));
    click(root.querySelector("#antCTA"));
    expect(s.isUnlocked("demon")).toBe(false);
    expect(s.get().mycel).toBe(100000);
  });

  it("says so rather than spending when the price is out of reach", () => {
    const s = store(10);
    const root = buildAntarium(s, { onOpenSpecies: () => {} });
    click(cardFor(root, "Weaver Ant"));
    expect(root.querySelector("#antCTA")?.textContent).toContain("Locked · needs");
    click(root.querySelector("#antCTA"));
    expect(s.get().mycel).toBe(10);
    expect(s.isUnlocked("weaver")).toBe(false);
  });
});

/**
 * A COLONY'S PAGE.
 *
 * It was four grey cards of the same shape with the cooldown printed in three of them and
 * "combat profile" bars measured against a made-up ceiling. What the rebuild is for: the
 * research comes first and states what you HAVE against what the next level buys, the bars
 * are measured against the other colonies, and the cooldown is stated once.
 */
describe("species page", () => {
  const openPage = (s: ProfileStore, species: SpeciesId = "fire"): HTMLElement =>
    buildSpeciesPage(s, { species, onBack: () => {} });

  it("names the colony and lists its three research tracks", () => {
    const root = openPage(store());
    expect(root.querySelector("#aupTitle, .screenh")?.textContent).toBe("Fire Ant");
    expect(root.querySelectorAll(".spgtrack").length).toBe(3);
    expect(root.textContent).toContain("Wildfire");
    expect(root.textContent).toContain(`0 of ${RESEARCH_TOTAL_MAX}`);
  });

  it("buys a research level with mycelium and shows the new one", () => {
    const s = store(researchCost(0));
    const root = openPage(s);
    click(buyIn(root, ".spgtrack", "Mandible muscle"));
    expect(s.get().research.fire?.mandible).toBe(1);
    expect(s.get().mycel).toBe(0);
    expect(root.querySelectorAll(".spgtrack .pip.on").length).toBe(1);
    expect(root.textContent).toContain(`1 of ${RESEARCH_TOTAL_MAX}`);
  });

  /**
   * NOW against NEXT, the Anthill's comparison. A price beside "+5% attack per level"
   * never says which level you are on or what the next one buys.
   */
  it("states what a track gives now against what the next level buys", () => {
    const s = store(100000);
    s.buyResearch("fire", "mandible");
    const row = Array.from(openPage(s).querySelectorAll<HTMLElement>(".spgtrack"))
      .find((r) => r.dataset.track === "mandible");
    expect(row?.querySelector(".che-now .che-v")?.textContent).toBe("+5% attack");
    expect(row?.querySelector(".che-next .che-v")?.textContent).toBe("+10% attack");
  });

  // The reservoir does four different things and the old summary named one of them.
  it("spells out everything a reservoir level actually gives", () => {
    const s = store(100000);
    for (let i = 0; i < RESEARCH_MAX; i++) s.buyResearch("fire", "reservoir");
    const row = Array.from(openPage(s).querySelectorAll<HTMLElement>(".spgtrack"))
      .find((r) => r.dataset.track === "reservoir");
    const now = row?.querySelector(".che-now .che-v")?.textContent ?? "";
    expect(now).toContain("x1.30");
    expect(now).toContain("+1 turn or tile");
    expect(now).toContain("-1 turn cooldown");
    // Leaf walls are Leafcutter's alone; naming them here put a sentence about leaves on
    // every other colony's page. Matched loosely on purpose — "leaf" is not a substring of
    // "leaves", so the obvious assertion passes against exactly the bug it is for.
    expect(now).not.toMatch(/leaf|leaves|permanent/i);
  });

  it("names the permanent leaves on the colony that actually gets them", () => {
    const s = store(100000);
    for (let i = 0; i < 3; i++) s.buyResearch("leafcutter", "reservoir");
    const row = Array.from(openPage(s, "leafcutter").querySelectorAll<HTMLElement>(".spgtrack"))
      .find((r) => r.dataset.track === "reservoir");
    expect(row?.querySelector(".che-now .che-v")?.textContent).toContain("2 permanent leaves");
  });

  it("moves the attack figure only after the research is bought", () => {
    const s = store(100000);
    expect(openPage(s).querySelector(".spgstat-v")?.textContent).toBe("0.86");
    s.buyResearch("fire", "mandible");
    expect(openPage(s).querySelector(".spgstat-v")?.textContent).toBe("0.90");
    expect(openPage(s).querySelector(".spgstat-v")?.className).toContain("up");
  });

  /**
   * The BAR, not only the figure. The researched length is drawn first and the colony's own
   * strength sits on top of it, so what shows past the end of the base is exactly what the
   * player added — and a bar that never grows looks identical to one that does until the
   * two widths are actually compared.
   */
  it("grows the bar past the colony's own strength when research buys some", () => {
    const s = store(100000);
    const widths = (): number[] =>
      Array.from(
        Array.from(openPage(s).querySelectorAll<HTMLElement>(".spgstat"))[0]!
          .querySelectorAll<HTMLElement>(".spgstat-f"),
      ).map((f) => parseFloat(f.style.width));
    const [grownBefore, baseBefore] = widths() as [number, number];
    expect(grownBefore).toBe(baseBefore);
    s.buyResearch("fire", "mandible");
    const [grownAfter, baseAfter] = widths() as [number, number];
    expect(grownAfter).toBeGreaterThan(baseAfter);
    expect(baseAfter).toBe(baseBefore);
  });

  /**
   * ONCE. It used to be in the stat block, in a note beneath it and in the ability card's
   * header — and in one of those it read "7t → 7t", because only a maxed reservoir
   * shortens a cooldown.
   */
  it("states the ability cooldown exactly once, and shortens it only at max", () => {
    const s = store(100000);
    const base = SPECIES.fire.ability.cooldown;
    const chips = (): string[] => Array.from(openPage(s).querySelectorAll(".spgchip"))
      .map((c) => c.textContent ?? "");
    expect(chips().filter((t) => /cooldown/i.test(t)).length).toBe(1);
    for (let i = 0; i < RESEARCH_MAX - 1; i++) s.buyResearch("fire", "reservoir");
    expect(chips().join()).toContain(`${base}-turn cooldown`);
    s.buyResearch("fire", "reservoir");
    expect(chips().join()).toContain(`${base - 1}-turn cooldown`);
    expect(openPage(s).textContent).not.toContain(`${base}t →`);
  });

  it("keeps research per species — levelling Fire leaves Ghost alone", () => {
    const s = store(100000);
    s.buyResearch("fire", "cuticle");
    expect(openPage(s, "ghost").textContent).toContain(`0 of ${RESEARCH_TOTAL_MAX}`);
  });

  // A tab that can only ever raise a toast is the same thing Settings' Sound switch was.
  it("offers no control that does nothing", () => {
    const root = openPage(store());
    expect(root.querySelector(".auptabs"), "the dead Customize tab is back").toBeNull();
    expect(root.textContent).not.toContain("Customize");
  });
});

/**
 * THE COLONY BANNER is the biggest thing under the top bar. It carries ONE number — the
 * colony — and everything beside it says where that number stands on the road: which
 * chapter, how far into it, and what filling the bar pays.
 */
describe("the colony banner", () => {
  const banner = (colony: number): HTMLElement => colonyBanner(colony, () => {});

  it("leads with the colony, compact", () => {
    expect(banner(1_284_000).querySelector(".col-n")?.textContent).toBe("1.2M");
    expect(banner(940).querySelector(".col-n")?.textContent).toBe("940");
  });

  /*
   * The label names WHERE ON THE ROAD the player stands. "Your colony" named the thing the
   * figure beside it already is, and a chapter is what the road itself is divided into.
   */
  it("names the chapter it is working through, not the thing it is showing", () => {
    const label = (colony: number): string | undefined =>
      banner(colony).querySelector(".col-t")?.textContent ?? undefined;
    expect(label(COLONY_START), "a new colony is not yet in chapter 1").toBe("Chapter 1");
    expect(label(stopColony(ROAD_CHAPTER_STOPS))).toBe("Chapter 2");
    expect(label(stopColony(ROAD_CHAPTER_STOPS * 4))).toBe("Chapter 5");
  });

  /*
   * The bar ends in the REWARD, not in the size of the rung: a second big figure beside
   * the one the banner leads with read as a sum of the two.
   */
  it("ends the bar with what filling it pays", () => {
    const rail = banner(1_284_000).querySelector(".col-rail");
    expect(rail?.querySelector(".col-pay svg"), "no reward mark on the bar").toBeTruthy();
    expect(rail?.textContent, "the rung's size is still printed there").toBe("");
  });

  it("fills the bar by how far between the two rungs the colony stands", () => {
    const from = stopColony(6);
    const to = stopColony(7);
    const half = (el: HTMLElement): string =>
      (el.querySelector(".tr-fill") as HTMLElement).style.width;
    expect(half(banner(from))).toBe("0%");
    expect(half(banner(Math.round((from + to) / 2)))).toBe("50%");
  });
});

describe("colony road screen", () => {
  /*
   * Rungs are named by INDEX and sized geometrically, so every case here asks the road what
   * a rung is worth rather than hard-coding a number a retune would move. Rung 2 is the
   * first that pays on the free track (one free reward a chapter, two rungs to a chapter).
   */
  const RUNG = 2;
  const atRung = (n: number, mycel = 0): ProfileStore => store(mycel, 0, stopColony(n));

  it("claims a reached free reward once and banks the currency", () => {
    const s = atRung(RUNG);
    const root = buildColonyRoad(s, () => {}, () => {});
    const ready = root.querySelectorAll<HTMLButtonElement>(".roadcell.ready");
    expect(ready.length).toBeGreaterThan(0);
    click(ready[0]);
    expect(s.get().mycel + s.get().pheromone).toBeGreaterThan(0);
    expect(s.get().roadClaimed).toContain(roadKey("free", RUNG));
    expect(root.querySelectorAll(".roadcell.got").length).toBe(1);
  });

  it("locks the pass track until the pass is owned", () => {
    const s = atRung(RUNG);
    const root = buildColonyRoad(s, () => {}, () => {});
    expect(root.querySelectorAll(".roadcell.passlock").length).toBeGreaterThan(0);
    for (const cell of Array.from(root.querySelectorAll<HTMLButtonElement>(".roadcell.passlock"))) {
      click(cell);
    }
    expect(s.get().roadClaimed.length).toBe(0);

    s.grantPass();
    const withPass = buildColonyRoad(s, () => {}, () => {});
    expect(withPass.querySelectorAll(".roadcell.passlock").length).toBe(0);
    // The tick beside it is a drawn mark now, not a ✓ typed into the string, so the
    // banner is asserted on by what it SAYS plus the presence of the mark.
    const banner = withPass.querySelector(".passon");
    expect(banner?.textContent).toContain("PASS");
    expect(banner?.querySelector("svg"), "the pass lost its mark").toBeTruthy();
  });

  it("offers nothing to a colony that has not reached the first rung", () => {
    const root = buildColonyRoad(store(), () => {}, () => {});
    expect(root.querySelectorAll(".roadcell.ready").length).toBe(0);
    expect(root.querySelectorAll(".rnode.done").length).toBe(0);
  });

  it("marks reached stops as done", () => {
    const root = buildColonyRoad(atRung(4), () => {}, () => {});
    expect(root.querySelectorAll(".rnode.done").length).toBe(4);
  });

  /** The figure on an unreached rung is the compact one — a road of 1,047,382 is unreadable. */
  it("writes the rungs the way the rest of the game writes the colony", () => {
    const root = buildColonyRoad(store(), () => {}, () => {});
    const nodes = Array.from(root.querySelectorAll(".rnode:not(.done) b"));
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.some((n) => n.textContent === compact(stopColony(1)))).toBe(true);
    // The road has to still be there at the sizes a compounding colony reaches.
    expect(nodes.some((n) => /[MB]$/.test(n.textContent ?? ""))).toBe(true);
  });

  /**
   * Every stop rendered identically, so the ladder gave the player no way to read their
   * own position off it. Exactly one stop — the first one out of reach — is the target.
   */
  it("marks the stop the player is working towards, and only that one", () => {
    const fresh = buildColonyRoad(store(), () => {}, () => {});
    const next = fresh.querySelectorAll(".roadrow.next");
    expect(next.length).toBe(1);
    expect(next[0]?.textContent).toContain(compact(stopColony(1)));

    // The marker moves along with the player rather than staying on the first stop.
    const later = buildColonyRoad(atRung(3), () => {}, () => {});
    const moved = later.querySelectorAll(".roadrow.next");
    expect(moved.length).toBe(1);
    expect(moved[0]?.textContent).toContain(compact(stopColony(4)));
  });

  it("shows the player their own colony in troops", () => {
    const root = buildColonyRoad(store(0, 0, 23_000), () => {}, () => {});
    expect(root.querySelector(".roadt")?.textContent).toBe("23K troops");
  });

  it("sends Get Pass to the shop, which is what sells it", () => {
    let wentToShop = false;
    const root = buildColonyRoad(store(), () => {}, () => { wentToShop = true; });
    click(root.querySelector(".passbuy"));
    expect(wentToShop).toBe(true);
  });
});

describe("colony screen", () => {
  it("lists today's quests with their progress and the colony level", () => {
    const s = store();
    const root = buildQuests(s, () => {});
    expect(root.querySelectorAll(".qcard").length).toBe(s.dailyQuests().length);
    expect(root.textContent).toContain("Daily streak · 0 days");
    expect(root.querySelector(".qbadge b")?.textContent).toBe("1");
    // Nothing is claimable on a fresh profile.
    expect(root.querySelectorAll(".qbtn.ready").length).toBe(0);
  });

  it("claims a finished quest, paying its reward and its XP", () => {
    const s = store();
    const first = s.dailyQuests()[0]!;
    const def = questDef(first.id)!;
    s.questProgress(def.kind, def.goal);

    const root = buildQuests(s, () => {});
    const claim = root.querySelector<HTMLButtonElement>(".qbtn.ready");
    expect(claim?.textContent).toBe("Claim");
    click(claim);
    expect(s.get().mycel).toBe(def.reward.mycel ?? 0);
    expect(s.get().pheromone).toBe(def.reward.pheromone ?? 0);
    expect(s.get().xp).toBe(def.xp);
    expect(root.querySelectorAll(".qbtn.claimed").length).toBe(1);
  });

  /**
   * The day's three roll from the day NUMBER (§12), so this has to hold whatever today
   * rolled. It used to take quest one and step it once — and on a day whose first quest
   * takes a single step, one step CLAIMS it, so the first in-progress button on the screen
   * belonged to a different quest and read 0/5. Pick a quest that cannot be finished in one.
   */
  it("shows progress on the button while a quest is unfinished", () => {
    const s = store();
    const def = s.dailyQuests().map((q) => questDef(q.id)!).find((d) => d.goal > 1);
    expect(def, "no daily quest today takes more than one step").toBeTruthy();
    s.questProgress(def!.kind, 1);
    const root = buildQuests(s, () => {});
    // Two quests can share a kind, so one step can move more than one button.
    const labels = Array.from(root.querySelectorAll(".qbtn.wip")).map((b) => b.textContent);
    expect(labels).toContain(`1/${def!.goal}`);
  });

  it("offers a level reward to claim once one is reached", () => {
    const s = store();
    s.update((p) => { p.xp = 500; });
    const root = buildQuests(s, () => {});
    const chip = root.querySelector<HTMLButtonElement>(".claimchip");
    expect(chip?.textContent).toContain("Lvl 1");
    const before = s.get().mycel;
    click(chip);
    expect(s.get().mycel).toBeGreaterThan(before);
    expect(s.get().claimedLevels).toContain(1);
  });

  /** Opening the screen must never be worth anything on its own. */
  it("never advances progress by being opened", () => {
    const s = store();
    buildQuests(s, () => {});
    buildQuests(s, () => {});
    expect(s.dailyQuests().every((q) => q.progress === 0)).toBe(true);
    expect(s.get().mycel).toBe(0);
    expect(s.get().xp).toBe(0);
  });
});

describe("scoring quests from engine events", () => {
  /** A profile whose day has a capture quest, whatever today happens to roll. */
  const withCapture = (): { store: ProfileStore; goal: number } => {
    const s = store();
    s.update((p) => {
      // Pin today's set, or the store rerolls it the moment progress is recorded.
      p.questDay = dayIndex();
      p.quests = [{ id: "conq30", progress: 0, claimed: false }];
    });
    return { store: s, goal: questDef("conq30")!.goal };
  };

  const at = { c: 1, r: 1 };

  it("counts the player's captures, once per event", () => {
    const { store: s } = withCapture();
    const events: EngineEvent[] = [
      { type: "capture", at, owner: "you", from: "L", previous: null },
      { type: "capture", at, owner: "you", from: "L", previous: "ai" },
      { type: "veinLaid", at, owner: "you" },
    ];
    scoreQuestEvents(s, events);
    expect(s.get().quests.find((q) => q.id === "conq30")?.progress).toBe(2);
    // The same count feeds the career total, from the same call: a quest that credits a
    // capture the profile does not is a pair of numbers that disagree on screen.
    expect(s.get().stats.conquered, "the career total was not credited").toBe(2);
  });

  it("ignores captures made by the AI", () => {
    const { store: s } = withCapture();
    scoreQuestEvents(s, [
      { type: "capture", at, owner: "ai", from: "L", previous: "you" },
      { type: "capture", at, owner: "ai", from: "R", previous: null },
    ]);
    expect(s.get().quests.find((q) => q.id === "conq30")?.progress).toBe(0);
    expect(s.get().stats.conquered, "the enemy's captures fed the player's record").toBe(0);
  });

  it("does nothing for a batch with no player captures in it", () => {
    const { store: s } = withCapture();
    const before = JSON.stringify(s.get());
    scoreQuestEvents(s, [
      { type: "production", owner: "you", gained: 4 },
      { type: "hiveAwake" },
    ]);
    expect(JSON.stringify(s.get())).toBe(before);
  });
});

/**
 * Structural parity with the legacy build.
 *
 * The stylesheet is that build's, verbatim, and it selects by these ids and class names —
 * so a rename here is not a rename, it is an unstyled screen. These assertions are the
 * cheap guard; the DOM/pixel comparison against legacy/zombie-ants-pro.html is the thorough
 * one, and it is what these were derived from.
 */
describe("legacy markup parity", () => {
  const landmarks = (root: HTMLElement): string[] =>
    Array.from(root.querySelectorAll<HTMLElement>("*"))
      .flatMap((e) => Array.from(e.classList));

  /**
   * The Anthill is a DELIBERATE deviation (CLAUDE.md §10): it is a cross-section of the
   * nest rather than the legacy build's list, so its insides are ours and dressed by
   * `skin.css`. `.hillwrap` stays, because that one IS the legacy scroller.
   */
  it("keeps the Anthill inside the legacy scroller and the page's column", () => {
    const root = buildAnthill(store());
    expect(root.id).toBe("anthill");
    expect(root.querySelector(".screenbody")?.className).toBe("screenbody sb-top");
    expect(landmarks(root), "the legacy scroller went with the redesign").toContain("hillwrap");
    expect(root.querySelector(".mycelchip .mycelv")?.textContent).toBe("0");
  });

  it("keeps the Antarium's banner → cta → tiered grid skeleton", () => {
    const root = buildAntarium(store(), { onOpenSpecies: () => {} });
    expect(root.id).toBe("antarium");
    for (const cls of ["rbanner", "rb-info", "rb-tier", "rb-name", "rb-tag", "rb-meta",
      "antcta", "antscroll", "tierhead", "tl", "tline", "tc", "cgrid", "ccard", "cname",
      "cstat", "cveil"]) {
      expect(landmarks(root), `.${cls} missing`).toContain(cls);
    }
    expect(root.querySelector("#antBanner")).toBeTruthy();
    expect(root.querySelector("#antCTA")).toBeTruthy();
    expect(root.querySelector("#antGrid")).toBeTruthy();
  });

  /**
   * The species page is a DELIBERATE deviation from the legacy skeleton (CLAUDE.md §10):
   * the legacy shape was four identical grey cards, and it was the last screen in the app
   * still wearing it. What is held here is the shape it was rebuilt into — and the ids the
   * router and the tour reach it by, which are not styling and must not drift.
   */
  it("keeps the species page's hero → research → ability skeleton", () => {
    const root = buildSpeciesPage(store(), { species: "fire", onBack: () => {} });
    expect(root.id).toBe("antup");
    for (const cls of ["spgwrap", "spghero", "spgstat", "spgtrack", "cheff", "che-row",
      "chfoot", "pips", "spgcard", "spgchip", "secthead"]) {
      expect(landmarks(root), `.${cls} missing`).toContain(cls);
    }
    expect(root.querySelector("#aupTitle")?.textContent).toBe("Fire Ant");
    expect(root.querySelector("#aupSub")).toBeTruthy();
    expect(root.querySelector("#aupBack")).toBeTruthy();
    expect(root.querySelector("#aupPort")).toBeTruthy();
  });

  it("keeps the Colony screen's qhero → qcard skeleton", () => {
    const root = buildQuests(store(), () => {});
    expect(root.id).toBe("quests");
    for (const cls of ["antscroll", "qhero", "qtop", "qbadge", "qti", "qbar", "qxp",
      "qstreak", "secthead", "qcard", "qic", "qb", "qn", "qp", "qmeta", "qact", "qbtn"]) {
      expect(landmarks(root), `.${cls} missing`).toContain(cls);
    }
    expect(root.querySelector("#questBody")).toBeTruthy();
  });

  it("keeps the Colony Road's road2 → roadchap → roadrow skeleton", () => {
    const root = buildColonyRoad(store(), () => {}, () => {});
    expect(root.id).toBe("achievements");
    expect(root.querySelector(".screenbody")?.id).toBe("achBody");
    for (const cls of ["road2", "roadchap", "roadchapter", "roadrow", "rcolL", "rcolC",
      "rcolR", "rnode", "roadcell", "rc-rew", "rc-btn", "roadhead", "roadhl", "roadt",
      "roadsub"]) {
      expect(landmarks(root), `.${cls} missing`).toContain(cls);
    }
    // The header strip is rendered last, which is what puts it at the foot of the ladder.
    const body = root.querySelector(".screenbody");
    expect(body?.lastElementChild?.className).toBe("roadhead");
  });
});

/**
 * HOW TO PLAY — the manual.
 *
 * It was seven lines. The value of the rebuild is not its length: it is that the numbers on
 * it are READ FROM THE ENGINE and the pictures are drawn by the board's own code, so a
 * balance change cannot leave the manual quietly lying about the game.
 */
describe("the manual", () => {
  const text = (): string => buildRules().textContent ?? "";

  it("covers every rule a player has to be told rather than discover", () => {
    const said = text();
    for (const heading of [
      "How a match is won", "A turn", "Moving and attacking", "What the tiles are worth",
      "Travel and veins", "Supply lines", "Rally and Advance", "The Hive",
      "Nine colonies", "What you play for",
    ]) {
      expect(said, `nothing about "${heading}"`).toContain(heading);
    }
  });

  /** Ten sections down one scroll: each is numbered, so a reader can see where they are. */
  it("numbers the sections", () => {
    const root = buildRules();
    const marks = Array.from(root.querySelectorAll(".ru-no")).map((n) => n.textContent);
    expect(marks.length).toBe(root.querySelectorAll(".ru-h").length);
    expect(marks[0]).toBe("01");
    expect(marks[marks.length - 1]).toBe(String(marks.length).padStart(2, "0"));
  });

  /*
   * Every figure on the screen is read from engine/config.ts. Hard-coding one is the whole
   * failure this guards: the manual would keep saying "+6 defence" long after it was +5.
   */
  it("quotes the engine's own numbers, never its own copy of them", () => {
    const said = text();
    expect(said).toContain(`${PROD.nest} troops a turn, +${DEF.nest} defence`);
    expect(said).toContain(`${PROD.stable} a turn, +${DEF.stable} defence`);
    expect(said).toContain(`${PROD.resourceStable} a turn, +${DEF.resourceOwned} defence`);
    expect(said).toContain(`${TRAVEL_RANGE} tiles`);
    expect(said).toContain(`turn ${MAPS.tiny.awakenTurn}`);
    expect(said).toContain(`every ${HIVE_GROW_EVERY} turns`);
    expect(said).toContain(`gone for ${HIVE_COOLDOWN} turns`);
    expect(said).toContain(`${KEEP_NORMAL} soldier`);
  });

  /**
   * The nine colonies are listed from the species table, not retyped beside it — but the
   * manual does NOT repeat what each ability does. That is written on the colony's own page
   * in the Antarium, where the player is choosing, and twice is twice to keep in step.
   */
  it("names every colony and leaves the abilities to the Antarium", () => {
    const said = text();
    for (const sp of Object.values(SPECIES)) {
      expect(said, `${sp.name} is missing`).toContain(sp.name);
      expect(said, `${sp.name}'s ability is spelled out here too`)
        .not.toContain(sp.ability.name);
    }
    expect(said).toContain("Antarium");
  });

  /**
   * The pictures are real positions drawn by the board's own code. jsdom has no 2D
   * context, so they draw nothing — and the screen has to come out whole anyway (§6).
   */
  it("puts a picture beside the rules that need one, and survives having no canvas", () => {
    const root = buildRules();
    const figures = root.querySelectorAll(".ru-fig");
    expect(figures.length).toBeGreaterThanOrEqual(6);
    for (const fig of Array.from(figures)) {
      expect(fig.querySelector("canvas"), "a figure with no picture in it").toBeTruthy();
      expect(fig.querySelector(".ru-cap")?.textContent, "a picture with no caption")
        .toBeTruthy();
    }
    expect(root.id).toBe("rules");
  });
});
/**
 * THE GRANARY PILL: where the passive troops are actually taken.
 *
 * The room is dug in the Anthill, but a payout waiting behind two taps is a payout nobody
 * takes — so it is emptied on the home screen, under the figure it pays into. What it has
 * to get right is that it always says SOMETHING: a control that reads as blank when the
 * store is empty looks broken rather than patient.
 */
describe("the granary pill", () => {
  const HOUR = 3_600_000;

  it("offers the store when there is something in it", () => {
    const s = store(0, 0, 10_000);
    s.update((p) => { p.granaryAt = Date.now() - 6 * HOUR; });
    const pill = granaryPill(s, () => {});
    expect(pill.className).toContain("ready");
    expect(pill.querySelector(".gp-go")?.textContent).toBe("Collect");
    expect(pill.querySelector(".gp-n")?.textContent).toBe(`+${compact(s.granary().stored)}`);
  });

  // Empty, it says what it is DOING. A blank control reads as a broken one.
  it("states the rate while the store is still filling", () => {
    const s = store(0, 0, 10_000);
    s.update((p) => { p.granaryAt = Date.now(); });
    const pill = granaryPill(s, () => {});
    expect(pill.className).not.toContain("ready");
    expect(pill.textContent).toContain("/h");
    expect(pill.textContent?.toLowerCase()).toContain("foraging");
    expect(pill.querySelector(".gp-go"), "offered to collect an empty store").toBeNull();
  });

  it("pays the store into the colony and tells the screen what came in", () => {
    const s = store(0, 0, 10_000);
    s.update((p) => { p.granaryAt = Date.now() - 40 * HOUR; });
    const before = s.get().colony;
    let paid = 0;
    const pill = granaryPill(s, (got) => { paid = got; });
    pill.click();
    expect(paid).toBe(granaryFull(before, 1));
    expect(s.get().colony).toBe(before + paid);
    // And it redraws itself: the store it just emptied must not still be on offer.
    expect(pill.className).not.toContain("ready");
  });

  // Collecting nothing must not report a payout, and must not restart the clock.
  it("does nothing at all when the store is empty", () => {
    const s = store(0, 0, 10_000);
    const stamp = Date.now();
    s.update((p) => { p.granaryAt = stamp; });
    let calls = 0;
    granaryPill(s, () => { calls++; }).click();
    expect(calls).toBe(0);
    expect(s.get().granaryAt).toBe(stamp);
    expect(s.get().colony).toBe(10_000);
  });
});
