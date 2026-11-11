/**
 * The progression screens, driven the way a player drives them.
 *
 * jsdom gives no canvas, so portraits come back null — that is deliberate: it proves the
 * screens survive a context they cannot draw into, which is the same failure mode as a
 * hidden tab (PROJECT_GUIDE.md §10). Everything asserted here is structure and state, never looks.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  CHAMBER_MAX, DEF, HIVE_COOLDOWN, HIVE_GROW_EVERY, KEEP_NORMAL, MAPS, PROD, SPECIES_LEVEL_MAX,
  SPECIES, TIERS as RARITY, TRAVEL_RANGE, chamberCost, researchCost,
} from "../../engine";
import type { SpeciesId } from "../../engine";
import {
  COLONY_START, GRANARY_LEVELS, GRANARY_MAX, MemoryStore, ProfileStore, REGIONS,
  RESEARCH_TOTAL_MAX, ROAD_AVATARS, ROAD_CHAPTERS, ROAD_CHAPTER_STOPS, ROAD_STOPS, SPECIES_UNLOCK, TIERS,
  traitDef, avatarName, chapterOf, compact, exact, freeReward, granaryFull, passReward, regionName, regionOf, roadKey, stopColony, tierOf,
} from "../../platform";
import { buildAnthill } from "../anthill";
import { buildProfile } from "../profile";
import { clockOf, colonyBanner, granaryPill } from "../chrome";
import { LEVEL_MAX, buildAntarium, levelOf } from "../antarium";
import { buildSpeciesPage } from "../species";
import type { EngineEvent } from "../../engine";
import { dayIndex, questDef } from "../../platform";
import { scoreQuestEvents } from "../../platform";
import { AVATAR_IDS, FREE_AVATARS } from "../../platform";
import { buildQuests } from "../quests";
import { buildColonyRoad } from "../road";
import { shelfArt } from "../shelf";
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
    // And what a VISIT actually carries in, which is most of what a level buys now: the
    // rate ladder is squeezed by the clock, so the store is where the step is (granary.ts).
    expect(now).toContain("a full store");
    expect(root.textContent?.toLowerCase(), "the granary priced itself in wins").not.toContain("win");
    // The next level really is faster AND holds more, or the comparison says nothing.
    const rate = (txt: string): number => Number(/\+([\d.]+)/.exec(txt)?.[1] ?? 0);
    const store_ = (txt: string): number => Number(/· ([\d.]+) a full store/.exec(txt)?.[1] ?? 0);
    expect(rate(next)).toBeGreaterThan(rate(now));
    expect(store_(next)).toBeGreaterThan(store_(now));
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
    // The mark is a picture either way, so the chip's text is the figure and nothing else.
    expect(chip?.textContent?.trim()).toBe("0");
    // `svg, .hudmark`, never the tag alone: a resource is the PAINTED mark now and a
    // painted one is an `<img>` (§ A RESOURCE IS ALWAYS THE PAINTED MARK). This test
    // named `svg` and failed the day the currency was painted, with the chip correct —
    // the same two-tag trap the stylesheet is swept for. What the chip owes is A MARK.
    expect(chip?.querySelector("svg, .hudmark"), "the mark went with the word").not.toBeNull();
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
  const nowhere = { onBack: () => {}, onColonies: () => {}, onChambers: () => {}, onQuests: () => {}, onHistory: () => {}, onTraits: () => {}, onAvatars: () => {} };
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

  /**
   * THE COLONY IS WRITTEN OUT IN FULL HERE, asked for directly: "we need to see the
   * exact colony number, not 2K — that's shortened for other screens like the home
   * screen." `compact()` is for a 30px banner and a chip in the chrome; this card is
   * what the screen is about, and 2K is any number between 2,000 and 2,099.
   */
  it("prints the colony exactly rather than rounded", () => {
    const s = played();
    s.update((p) => { p.colony = 1_234_567; });
    const fig = buildProfile(s, nowhere).querySelector(".pf-colony-n");
    expect(fig?.textContent).toBe(exact(1_234_567));
    expect(fig?.textContent, "the profile still rounds the colony").not.toBe(compact(1_234_567));
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
    expect(rows.length, "the collection block is not there").toBe(4);
    expect(rows[0]?.textContent).toContain("Colonies");
    expect(rows[0]?.textContent).toContain(`/ ${Object.keys(SPECIES).length}`);
    expect(rows[1]?.textContent).toContain("Nest chambers");
    expect(rows[1]?.textContent, "the chamber just bought is not counted").toContain("1 / ");
    expect(rows[2]?.textContent).toContain("Research levels");
    // The faces, which are the one row here that is NEVER gated: a colony that has
    // collected nothing already has the ten it starts with.
    expect(rows[3]?.textContent).toContain("Avatars");
    expect(rows[3]?.textContent).toContain(`${FREE_AVATARS.length} / ${AVATAR_IDS.length}`);
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
      onHistory: () => seen.push("history"),
      onTraits: () => seen.push("traits"),
      onAvatars: () => seen.push("avatars"),
    });
    const rows = Array.from(root.querySelectorAll<HTMLButtonElement>(".pf-row"));
    for (const r of rows) r.click();
    // The avatars are the one collection row that is NEVER gated — a new colony already
    // has ten of them, so the door is open before anything has been earned.
    expect(seen).toEqual(["history", "quests", "colonies", "chambers", "colonies", "avatars"]);
  });

  /**
   * THE MATCH LIST RIDES WITH THE HERO, above everything the record says about it. It sat
   * under the COLLECTION — three doors and a strip of heads deep — so from the top
   * of the screen it did not exist at all, and the record stayed a count with no way into
   * the matches it was counting. Everything under "Record" is a summary of these matches,
   * and the way into a summary belongs beside the thing it summarises.
   */
  it("puts the match list under the hero, above the record", () => {
    const root = buildProfile(played(), nowhere);
    const order = Array.from(root.querySelectorAll<HTMLElement>(".pf-hero, .secthead, #pfHistory"))
      .map((e) => e.id === "pfHistory" ? "matches" : e.classList.contains("pf-hero") ? "who" : e.textContent);
    expect(order).toEqual(["who", "matches", "Record", "In the field", "Collection"]);
  });

  // A door with a count behind it, not a label: how many there are to look at is the
  // reason to open it, and "none yet" is what an empty one has to say for itself.
  it("says how many matches are stored", () => {
    const s = played();
    const built = (): HTMLElement => buildProfile(s, nowhere);
    expect(built().querySelector("#pfHistory")?.textContent).toContain("none yet");
    s.rememberMatch({
      id: "m:1", at: 1, map: "small", you: "fire", foe: "ghost", foeName: "Vela",
      human: false, winner: "you", reason: null, turns: 4, playedMs: 1000,
      colonyBefore: 40, colonyAfter: 48,
    });
    expect(built().querySelector("#pfHistory")?.textContent).toContain("1");
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

  /**
   * ONE RARITY LADDER. The colonies used to have their own — "Founding castes / Rare
   * colonies / Elite castes" in their own colours — so the same rung had two names and the
   * top one had two colours. They read off the game's ladder now, and Common is held open
   * because there is no grey colony yet and there will be.
   */
  it("shows every species, grouped by the game's own rarity tiers", () => {
    const root = openAntarium(store());
    expect(root.querySelectorAll(".ccard").length).toBe(Object.keys(SPECIES).length);
    expect(root.querySelectorAll(".tierhead").length).toBe(4);
    const said = root.textContent ?? "";
    for (const name of ["Uncommon", "Rare", "Exceptional", "Mythic"]) {
      expect(said, `the Antarium does not use the ladder's "${name}"`).toContain(name);
    }
    expect(said, "a colony took the rung being held open").not.toContain("Common");
    expect(said, "the old species-only ladder is still here").not.toContain("Founding castes");
  });

  /**
   * The counts are READ OFF THE CATALOGUE, never typed here. A tier is derived from a
   * colony's price, so retuning one price moves a colony between two headings — and a
   * hardcoded "3/3" then fails on a change that is not a bug, or passes one that is.
   */
  it("counts owned colonies per tier", () => {
    const root = openAntarium(store());
    const heads = Array.from(root.querySelectorAll(".tierhead"));
    const ids = Object.keys(SPECIES) as SpeciesId[];
    // The headings run in tier order, so the nth heading is the nth tier that has any
    // colony in it at all — an empty rung is held open in the ladder (common) and draws
    // no heading here.
    const rungs = [...new Set(TIERS.map((t) => t.k))].filter(
      (k) => ids.some((id) => tierOf(id).k === k),
    );
    const sizeOf = (k: string): number => ids.filter((id) => tierOf(id).k === k).length;
    // A new profile owns exactly the free colonies, and they are the first rung.
    expect(heads[0]?.textContent).toContain(`${sizeOf(rungs[0]!)}/${sizeOf(rungs[0]!)}`);
    expect(ids.filter((id) => SPECIES_UNLOCK[id] === 0).length).toBe(sizeOf(rungs[0]!));
    // Nothing on any later rung is owned yet.
    expect(heads[1]?.textContent).toContain(`0/${sizeOf(rungs[1]!)}`);
  });

  it("starts both owned and unowned colonies at zero, with ownership shown separately", () => {
    const s = store(10_000, 10_000);
    const root = openAntarium(s);
    expect(cardFor(root, "Army Ant")?.className).toContain("locked");
    expect(cardFor(root, "Army Ant")?.querySelector(".an-lv")?.textContent).toBe("0");
    expect(cardFor(root, "Fire Ant")?.className).not.toContain("locked");
    expect(cardFor(root, "Fire Ant")?.querySelector(".an-lv")?.textContent).toBe("0");
    s.unlockSpecies("army");
    expect(levelOf(s, "army")).toBe(0);
    s.buyResearch("army");
    expect(levelOf(s, "army")).toBe(1);
  });

  it("draws the ten shared rungs and keeps the collection badge in agreement", () => {
    const s = store(100_000, 100_000);
    const root = openAntarium(s);
    expect(root.querySelectorAll("#antBanner .rb-pip")).toHaveLength(10);
    expect(LEVEL_MAX).toBe(RESEARCH_TOTAL_MAX);
    expect(root.querySelectorAll("#antBanner .rb-pip.on")).toHaveLength(0);
    const id = s.get().lastSpecies;
    for (let i = 0; i < 3; i++) s.buyResearch(id);
    const again = openAntarium(s);
    expect(again.querySelectorAll("#antBanner .rb-pip.on")).toHaveLength(3);
    expect(again.querySelector("#antBanner .an-lv")).toBeNull();
    expect(again.querySelector(`.ccard[data-ant="${id}"] .an-lv`)?.textContent).toBe("3");
  });

  /** A colony you do not own lights none of them, which is the badge's 0 drawn long. */
  it("lights no rung on a colony you do not own", () => {
    const root = openAntarium(store());
    click(cardFor(root, "Bullet Ant"));
    expect(root.querySelectorAll("#antBanner .rb-pip.on").length).toBe(0);
    expect(root.querySelector("#antBanner .an-lv")).toBeNull();
    expect(root.querySelector('.ccard[data-ant="bullet"] .an-lv')?.textContent).toBe("0");
  });

  /**
   * A TILE IS PAINTED IN ITS RARITY, AND THE SCREEN IS WHAT SAYS SO.
   *
   * The stylesheet only knows `var(--fill, …)`, so this is the half that decides WHICH
   * colour — and it is the half nothing visual would catch: every locked card is grey
   * whatever the screen hands it, so a tier wired to the wrong fill shows up only on a
   * colony somebody has actually bought.
   */
  it("paints an owned tile in its rarity and leaves a locked one to the stylesheet", () => {
    const s = store(100_000);
    for (const id of Object.keys(SPECIES) as SpeciesId[]) {
      if (!SPECIES[id].premium) s.unlockSpecies(id);
    }
    const root = openAntarium(s);
    for (const card of Array.from(root.querySelectorAll<HTMLElement>(".ccard"))) {
      const id = card.dataset.ant as SpeciesId;
      const tile = card.querySelector<HTMLElement>(".an-tile");
      const fill = tile?.style.getPropertyValue("--fill") ?? "";
      if (s.isUnlocked(id)) {
        expect(fill, `${id} is not painted in its rarity`).toBe(tierOf(id).fill);
      } else {
        // A LOCKED TILE IS HANDED NO COLOUR AT ALL, so one rule owns what "not yours"
        // looks like. Setting a grey here would be the second place deciding it.
        expect(fill, `${id} was painted while locked`).toBe("");
      }
    }
  });

  /**
   * THE PRICE IS ON THE CONTROL THAT CAN ACT ON IT, and nowhere else.
   *
   * It used to be printed on a veil over every locked card — eight prices on screen at
   * once, none of them pressable. A price is a thing to act on, so it belongs on the one
   * button that acts, which names it the moment that colony is selected.
   */
  it("prints no price on the cards themselves", () => {
    const root = openAntarium(store());
    expect(root.querySelector(".cveil"), "the price veil came back").toBeNull();
    expect(cardFor(root, "Army Ant")?.textContent)
      .not.toContain(String(SPECIES_UNLOCK.army));
  });

  it("re-points the banner and the call to action at the colony you tap", () => {
    const root = openAntarium(store());
    click(cardFor(root, "Bullet Ant"));
    expect(root.querySelector(".rb-name")?.textContent).toBe("Bullet Ant");
    expect(root.querySelector("#antCTA")?.textContent).toContain(String(SPECIES_UNLOCK.bullet));
    // The level badge stays in the listing, while the large portrait stays clear.
    expect(root.querySelector(".rb-nl"), "the old level line came back").toBeNull();
    expect(root.querySelector("#antBanner .an-lv")).toBeNull();
    expect(root.querySelector('.ccard[data-ant="bullet"] .an-lv')?.textContent).toBe("0");
    // Two chips, not four: the level is in the listing, and the cooldown — the one
    // fact this screen is not about — is stated on the colony's own page instead.
    expect(root.querySelectorAll(".rb-meta .statchip").length).toBe(2);
    expect(root.querySelector(".rb-meta .lv"), "the level rejoined the chips").toBeNull();
    expect(root.querySelector(".rb-meta")?.textContent, "the cooldown came back")
      .not.toContain("t");
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
    const s = store(SPECIES_UNLOCK.army);
    const root = buildAntarium(s, { onOpenSpecies: () => {} });
    click(cardFor(root, "Army Ant"));
    const price = root.querySelector<HTMLButtonElement>("#antCTA");
    expect(price?.textContent?.trim()).toBe(String(SPECIES_UNLOCK.army));
    expect(price?.querySelector("img.hudmark")).toBeTruthy();
    expect(price?.disabled).toBe(false);
    click(price);
    expect(s.isUnlocked("army")).toBe(true);
    expect(s.get().mycel).toBe(0);
    expect(root.querySelector('.screentop [data-purse="mycel"] .mycelv')?.textContent).toBe("0");
    expect(root.querySelector("#antCTA")?.textContent).toBe("Upgrade & research");
    expect(cardFor(root, "Army Ant")?.className).not.toContain("locked");
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

  it("shows only the disabled icon price and current balance when unaffordable", () => {
    const s = store(10);
    const root = buildAntarium(s, { onOpenSpecies: () => {} });
    click(cardFor(root, "Army Ant"));
    const price = root.querySelector<HTMLButtonElement>("#antCTA");
    expect(price?.textContent?.trim()).toBe(String(SPECIES_UNLOCK.army));
    expect(price?.querySelector("img.hudmark")).toBeTruthy();
    expect(price?.disabled).toBe(true);
    expect(price?.getAttribute("aria-label")).toContain("mycelium");
    expect(root.querySelector('.screentop [data-purse="mycel"] .mycelv')?.textContent).toBe("10");
    click(root.querySelector("#antCTA"));
    expect(s.get().mycel).toBe(10);
    expect(s.isUnlocked("army")).toBe(false);
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

  it("shows one shared level and three bounded stats instead of separate research tracks", () => {
    const root = openPage(store());
    expect(root.querySelector("#aupTitle")?.textContent).toBe("Fire Ant");
    expect(root.querySelectorAll(".spgtrack")).toHaveLength(0);
    expect(root.querySelectorAll(".spgdone .rb-pip")).toHaveLength(10);
    expect(root.querySelector(".spgdone-v")?.textContent).toBe("0 / 10");
    expect(Array.from(root.querySelectorAll(".spgstat-v")).map((n) => n.textContent))
      .toEqual(["0.86", "0.87", "0%"]);
  });

  it("buys all three gains together and rerenders the price, balance and squares", () => {
    const s = store(500, researchCost(0));
    const root = openPage(s);
    click(root.querySelector("#spgUpgrade"));
    expect(s.get().research.fire?.level).toBe(1);
    expect(s.get().pheromone).toBe(0);
    expect(s.get().mycel).toBe(500);
    expect(root.querySelectorAll(".spgdone .rb-pip.on")).toHaveLength(1);
    expect(root.querySelector(".spgdone-v")?.textContent).toBe("1 / 10");
    expect(Array.from(root.querySelectorAll(".spgstat-v")).map((n) => n.textContent))
      .toEqual(["0.88", "0.89", "1%"]);
    expect(root.querySelector<HTMLButtonElement>("#spgUpgrade")?.disabled).toBe(true);
    expect(root.querySelector("#spgUpgrade")?.textContent).toContain(String(researchCost(1)));
  });

  it("shows the crystal purse and uses a disabled price when unaffordable", () => {
    const s = store(500, 0);
    const root = openPage(s);
    const chip = root.querySelector<HTMLElement>(".screentop .mycelchip");
    expect(chip?.dataset.purse).toBe("pheromone");
    expect(root.querySelector<HTMLButtonElement>("#spgUpgrade")?.disabled).toBe(true);
    click(root.querySelector("#spgUpgrade"));
    expect(s.get().research.fire?.level).toBe(0);
    expect(s.get().mycel).toBe(500);
  });

  it("places the single upgrade below the stats and above the unboxed trait row", () => {
    const root = openPage(store());
    const hero = root.querySelector(".spghero")!;
    const upgrade = hero.querySelector("#spgUpgrade")!;
    const stats = hero.querySelector(".spgstats")!;
    const traits = hero.querySelector("#spgTraits")!;
    expect(stats.compareDocumentPosition(upgrade) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(upgrade.nextElementSibling).toBe(traits);
    expect(traits.parentElement).toBe(hero);
    expect(traits.closest(".panel-group")).toBeNull();
  });

  it("grows attack and defense beyond the unchanged base length", () => {
    const s = store(0, 100000);
    const widths = (): number[] => Array.from(openPage(s).querySelectorAll<HTMLElement>(
      '[data-stat="attack"] .spgstat-f')).map((f) => parseFloat(f.style.width));
    const [before, base] = widths();
    expect(before).toBe(base);
    s.buyResearch("fire");
    const [after, baseAfter] = widths();
    expect(after).toBeGreaterThan(baseAfter!);
    expect(baseAfter).toBe(base);
  });

  it("caps all three stats at level ten and disables further purchases", () => {
    const s = store(0, 100000);
    for (let i = 0; i < SPECIES_LEVEL_MAX; i++) s.buyResearch("fire");
    const root = openPage(s);
    expect(root.querySelectorAll(".rb-pip.on")).toHaveLength(10);
    expect(Array.from(root.querySelectorAll(".spgstat-v")).map((n) => n.textContent))
      .toEqual([(SPECIES.fire.atk * 1.25).toFixed(2), (SPECIES.fire.def * 1.25).toFixed(2), "10%"]);
    expect(root.querySelector("#spgUpgrade")?.textContent).toBe("MAX");
    const balance = s.get().pheromone;
    click(root.querySelector("#spgUpgrade"));
    expect(s.get().pheromone).toBe(balance);
  });

  it("keeps the base ability cooldown and no longer sells potency or permanent leaves", () => {
    const s = store(0, 100000);
    for (let i = 0; i < SPECIES_LEVEL_MAX; i++) s.buyResearch("fire");
    const text = openPage(s).textContent!;
    expect(text).toContain(`${SPECIES.fire.ability.cooldown}-turn cooldown`);
    expect(text).not.toContain("Potency");
    expect(text).not.toContain("Exocrine reservoir");
  });

  it("keeps research per species", () => {
    const s = store(0, 100000);
    s.buyResearch("fire");
    expect(openPage(s, "ghost").querySelector(".spgdone-v")?.textContent).toBe("0 / 10");
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
   * NO WORDS ON IT AT ALL. The rail read "Chapter 12" over the bar — the one fact on
   * this banner the bar itself cannot show, and one said in full on the screen the
   * banner opens. Removed directly; what is left is the figure, the bar and the mark
   * for what the next rung pays.
   */
  it("writes nothing on the rail", () => {
    const rail = banner(1_284_000).querySelector(".col-rail");
    expect(rail?.querySelector(".col-t"), "the chapter label is back").toBeNull();
    expect(rail?.textContent?.trim(), "there is text on the rail").toBe("");
  });

  /*
   * The bar ends in the REWARD, not in the size of the rung: a second big figure beside
   * the one the banner leads with read as a sum of the two.
   */
  it("ends the bar with what filling it pays", () => {
    const rail = banner(1_284_000).querySelector(".col-rail");
    // THE TAG FOLLOWS THE FILE, so the assertion may not name one: a currency with a
    // painted mark is an `<img class="hudmark">` and one without is an `<svg>`
    // (§ THE PAINTED CHROME MARKS). Asserting `svg` here held for exactly as long as the
    // currencies were drawn and failed the day they were painted, while the rail was
    // perfectly correct. What the rail owes is A MARK.
    expect(rail?.querySelector(".col-pay svg, .col-pay .hudmark"),
      "no reward mark on the bar").toBeTruthy();
  });

  /*
   * THE BAR MEASURES THE CHAPTER, NOT THE RUNG. It used to run 0 to 100% between every
   * single checkpoint, so it swept the whole width five times a chapter and said nothing
   * about where in the chapter the colony stood. Five checkpoints, filling one fifth at
   * a time, and EMPTY again on the first rung of the next chapter.
   */
  it("fills the bar a fifth per checkpoint of the chapter", () => {
    const pct = (colony: number): number =>
      parseFloat((banner(colony).querySelector(".tr-fill") as HTMLElement).style.width);
    const step = 100 / ROAD_CHAPTER_STOPS;

    // The first rung of a chapter: nothing banked inside it yet.
    expect(pct(stopColony(ROAD_CHAPTER_STOPS)), "a new chapter starts part-filled")
      .toBeCloseTo(0, 5);
    // One checkpoint in, and half way to the second.
    const from = stopColony(ROAD_CHAPTER_STOPS + 1);
    const to = stopColony(ROAD_CHAPTER_STOPS + 2);
    expect(pct(from)).toBeCloseTo(step, 5);
    expect(pct(Math.round((from + to) / 2))).toBeCloseTo(step * 1.5, 1);
    // And the last checkpoint of a chapter is the last fifth.
    expect(pct(stopColony(ROAD_CHAPTER_STOPS * 2 - 1)))
      .toBeCloseTo(step * (ROAD_CHAPTER_STOPS - 1), 5);
  });

  /*
   * AND THE FIFTHS ARE CUT BY FOUR REAL ELEMENTS. A repeating gradient is the obvious
   * way to rule a bar and is silently nothing here — the blanket clears every background
   * image outside four whole screens, and a descendant of one is not exempt (§10). Four
   * dividers for five pieces, evenly spaced, inside the track so they sit over the fill.
   */
  it("rules the bar into the chapter's five checkpoints", () => {
    const track = banner(1_284_000).querySelector(".tr-bar") as HTMLElement;
    const cuts = Array.from(track.querySelectorAll<HTMLElement>(".tr-cut"));
    expect(cuts.length, "a divider per boundary between the five")
      .toBe(ROAD_CHAPTER_STOPS - 1);
    expect(cuts.map((c) => Math.round(parseFloat(c.style.left))))
      .toEqual([20, 40, 60, 80]);
  });
});

describe("colony road screen", () => {
  const RUNG = 2;
  const atRung = (n: number): ProfileStore => store(0, 0, stopColony(n));

  it("claims a normal reward once and banks only that track", () => {
    const s = atRung(RUNG);
    const root = buildColonyRoad(s, () => {}, () => {});
    const paid = freeReward(RUNG)!;
    click(root.querySelector(`.rd-prize.free[data-stop="${RUNG}"]`));
    expect(s.get().mycel).toBe(paid.mycel ?? 0);
    expect(s.get().pheromone).toBe(paid.pheromone ?? 0);
    expect(s.get().roadClaimed).toEqual([roadKey("free", RUNG)]);
    const before = s.get().mycel;
    click(root.querySelector(`.rd-prize.free[data-stop="${RUNG}"]`));
    expect(s.get().mycel).toBe(before);
    expect(root.querySelector(".rd-prize.free.got .rd-done")).toBeTruthy();
  });

  it("confirms the actual reward paid and closes the popup", () => {
    const s = atRung(RUNG);
    const root = buildColonyRoad(s, () => {}, () => {});
    click(root.querySelector(".rd-prize.free.ready"));
    const pop = root.querySelector("#roadPop");
    expect(root.classList.contains("popped")).toBe(true);
    const paid = freeReward(RUNG)!;
    expect(pop?.querySelector(".rd-popn")?.textContent).toBe(`+${paid.mycel ?? paid.pheromone}`);
    expect(pop?.querySelector(".rd-popic img.hudmark")).toBeTruthy();
    click(pop);
    expect(root.querySelector("#roadPop")).toBeNull();
    expect(root.classList.contains("popped")).toBe(false);
  });

  it("shows both tracks and opens the shop instead of paying an unowned pass reward", () => {
    const s = atRung(RUNG);
    let shops = 0;
    const root = buildColonyRoad(s, () => {}, () => { shops++; });
    expect(root.querySelectorAll(".rd-prize.free")).toHaveLength(ROAD_STOPS);
    expect(root.querySelectorAll(".rd-prize.pass")).toHaveLength(ROAD_STOPS);
    const locked = root.querySelector(`.rd-prize.pass[data-stop="${RUNG}"]`);
    expect(locked?.querySelector(".rd-lock")).toBeTruthy();
    click(locked);
    expect(shops).toBe(1);
    expect(s.get().mycel).toBe(0);
    expect(s.get().pheromone).toBe(0);
    expect(s.get().roadClaimed).toEqual([]);
  });

  it("claims normal and premium rewards independently without changing their combined payout", () => {
    const s = atRung(RUNG);
    s.grantPass();
    const root = buildColonyRoad(s, () => {}, () => {});
    expect(root.querySelectorAll(".rd-prize.free.ready")).toHaveLength(RUNG);
    expect(root.querySelectorAll(".rd-prize.pass.ready")).toHaveLength(RUNG);
    const free = freeReward(RUNG)!, pass = passReward(RUNG)!;
    click(root.querySelector(`.rd-prize.pass[data-stop="${RUNG}"]`));
    expect(s.get().roadClaimed).toEqual([roadKey("pass", RUNG)]);
    expect(s.get().mycel).toBe(pass.mycel ?? 0);
    click(root.querySelector("#roadPop"));
    click(root.querySelector(`.rd-prize.free[data-stop="${RUNG}"]`));
    expect(s.get().mycel).toBe((free.mycel ?? 0) + (pass.mycel ?? 0));
    expect(s.get().pheromone).toBe((free.pheromone ?? 0) + (pass.pheromone ?? 0));
    expect(s.get().roadClaimed).toEqual([roadKey("pass", RUNG), roadKey("free", RUNG)]);
  });

  it("keeps earlier combined claims paid when the cards are separated", () => {
    const s = atRung(RUNG);
    s.grantPass();
    s.claimRoad(roadKey("free", RUNG));
    s.claimRoad(roadKey("pass", RUNG));
    const before = s.get().mycel;
    const root = buildColonyRoad(s, () => {}, () => {});
    for (const track of ["free", "pass"]) {
      const card = root.querySelector(`.rd-prize.${track}[data-stop="${RUNG}"]`);
      expect(card?.classList.contains("got")).toBe(true);
      click(card);
    }
    expect(s.get().mycel).toBe(before);
  });

  it("makes only the new premium reward available after a later pass purchase", () => {
    const s = atRung(RUNG);
    s.claimRoad(roadKey("free", RUNG));
    s.grantPass();
    const root = buildColonyRoad(s, () => {}, () => {});
    expect(root.querySelector(`.rd-prize.free[data-stop="${RUNG}"]`)?.classList.contains("got")).toBe(true);
    const pass = root.querySelector(`.rd-prize.pass[data-stop="${RUNG}"]`);
    expect(pass?.classList.contains("ready")).toBe(true);
    expect(pass?.querySelector(".rd-amount")?.textContent).toBe(String(passReward(RUNG)!.mycel));
    click(pass);
    expect(s.get().roadClaimed).toEqual([roadKey("free", RUNG), roadKey("pass", RUNG)]);
    expect(s.get().mycel).toBe((freeReward(RUNG)!.mycel ?? 0) + (passReward(RUNG)!.mycel ?? 0));
  });

  it("shows the established quantity or named avatar on every card of each track", () => {
    const root = buildColonyRoad(atRung(RUNG), () => {}, () => {});
    for (const card of Array.from(root.querySelectorAll<HTMLElement>(".rd-prize"))) {
      const index = Number(card.dataset.stop);
      const reward = card.dataset.track === "pass" ? passReward(index)! : freeReward(index)!;
      expect(card.querySelectorAll(".rd-mark img")).toHaveLength(reward.trait ? 0 : 1);
      if (reward.avatar) {
        expect(card.querySelector(".rd-face")).toBeTruthy();
        expect(card.querySelector(".rd-amount")).toBeNull();
        expect(ROAD_AVATARS.map((id) => avatarName(id))).toContain(card.getAttribute("aria-label"));
      } else if (reward.trait) {
        expect(card.querySelector(".rd-mystery")?.textContent).toBe("?");
        expect(card.querySelector(".rd-caption")?.textContent).toBe("Trait");
        expect(card.querySelector(".rd-amount")).toBeNull();
        expect(card.getAttribute("aria-label")).toBe(`A random ${RARITY[reward.trait].name} trait`);
        expect(card.dataset.tier).toBe(reward.trait);
        expect(card.style.getPropertyValue("--rd-trait-fill")).toBe(RARITY[reward.trait].fill);
        expect(card.querySelector(".rd-rarity")?.textContent).toBe(RARITY[reward.trait].name);
      } else {
        const source = shelfArt(reward.mycel ? "mycel.1500" : "pher.900");
        expect(card.querySelector("img.rd-resource")?.getAttribute("src")).toBe(source);
        expect(card.querySelector(".rd-amount")?.textContent)
          .toBe(String((reward.mycel ?? 0) + (reward.pheromone ?? 0)));
      }
    }
  });

  it("reveals the actual premium trait that was saved", () => {
    const s = atRung(3);
    s.grantPass();
    const root = buildColonyRoad(s, () => {}, () => {});
    click(root.querySelector('.rd-prize.pass[data-stop="3"]'));
    const item = s.get().bag[0]!;
    expect(item).toBeTruthy();
    expect(root.querySelector("#roadPop")?.textContent).toContain(traitDef(item.def)!.name);
    expect(s.get().roadClaimed).toContain("p3");
    expect(root.querySelector('.rd-prize.pass[data-stop="3"]')?.classList.contains("got")).toBe(true);
  });

  it("does not offer a claim before the first threshold", () => {
    const root = buildColonyRoad(store(), () => {}, () => {});
    expect(root.querySelectorAll(".rd-prize.ready")).toHaveLength(0);
    expect(root.querySelectorAll(".rd-stop.reached")).toHaveLength(0);
    expect(root.querySelector<HTMLButtonElement>(".rd-prize.free")?.disabled).toBe(true);
  });

  it("shows colony progress, reached thresholds and exactly one next checkpoint", () => {
    const root = buildColonyRoad(atRung(4), () => {}, () => {});
    expect(root.querySelectorAll(".rd-stop.reached")).toHaveLength(4);
    expect(root.querySelector(".rd-stop.reached .rd-at")?.textContent).toBe(compact(stopColony(4)));
    expect(root.querySelectorAll(".rd-stop.next")).toHaveLength(1);
    expect(root.querySelector(".rd-stop.next")?.textContent).toContain(compact(stopColony(5)));
    const progress = root.querySelector('[role="progressbar"]');
    expect(progress?.getAttribute("aria-valuenow")).toBe(String(stopColony(4)));
    expect(root.querySelector(".rd-player .roadt")?.textContent).toBe(compact(stopColony(4)));
  });

  it("has only a floating back control above the road, without a title or footer", () => {
    let backed = false;
    const root = buildColonyRoad(store(), () => { backed = true; }, () => {});
    expect(root.querySelector(".screentop, .screenh, .roadhead")).toBeNull();
    click(root.querySelector(".rd-back"));
    expect(backed).toBe(true);
  });

  it("keeps all fifty chapters and their five rewards in climbing order", () => {
    const root = buildColonyRoad(store(), () => {}, () => {});
    expect(root.querySelectorAll(".rd-chap")).toHaveLength(ROAD_CHAPTERS);
    expect(root.querySelectorAll(".rd-stop")).toHaveLength(ROAD_STOPS);
    expect(root.querySelectorAll(".rd-stop.big")).toHaveLength(ROAD_CHAPTERS);
    const first = Array.from(root.querySelectorAll(".rd-chap")).at(-1);
    expect(first?.querySelectorAll(".rd-stop")).toHaveLength(ROAD_CHAPTER_STOPS);
    expect(first?.querySelector(".rd-stop")?.classList.contains("big")).toBe(true);
    const gates = Array.from(root.querySelectorAll(".rd-gate"));
    expect(gates).toHaveLength(ROAD_CHAPTERS);
    expect(gates[0]?.querySelector(".rd-gatek")?.textContent).toBe("Chapter 50");
    expect(gates.at(-1)?.querySelector(".rd-gatek")?.textContent).toBe("Chapter 1");
    expect(gates[0]?.querySelector(".rd-gaten")?.textContent).toBe(regionName(REGIONS.length));
    expect(gates.at(-1)?.querySelector(".rd-gaten")?.textContent).toBe(regionName(1));
  });

  it("keeps area palettes behind the same plain chapter block", () => {
    const root = buildColonyRoad(store(), () => {}, () => {});
    const colors = new Map<number, string>();
    for (const [i, panel] of Array.from(root.querySelectorAll<HTMLElement>(".rd-chap")).entries()) {
      const region = regionOf(ROAD_CHAPTERS - i);
      const palette = ["--rd-normal", "--rd-pass"].map((key) => panel.style.getPropertyValue(key)).join();
      expect(palette).not.toBe(",");
      expect(panel.querySelector(".rd-breaker")).toBeTruthy();
      expect(panel.querySelector(".rd-dividerart")).toBeNull();
      expect(panel.querySelector(".rd-premiumwash")).toBeTruthy();
      expect(panel.querySelector(".rd-trackname:not(.premium)")?.textContent).toBe("FREE REWARDS");
      if (colors.has(region)) expect(palette).toBe(colors.get(region));
      else colors.set(region, palette);
    }
    expect(new Set(colors.values()).size).toBe(REGIONS.length);
  });

  it("keeps claimed checks after the colony falls below a checkpoint", () => {
    const s = atRung(RUNG);
    s.claimRoad(roadKey("free", RUNG));
    s.update((profile) => { profile.colony = COLONY_START; });
    const root = buildColonyRoad(s, () => {}, () => {});
    expect(root.querySelector(`.rd-prize.free[data-stop="${RUNG}"]`)?.classList.contains("got")).toBe(true);
    expect(root.querySelector(`.rd-prize.free[data-stop="${RUNG}"] .rd-done`)).toBeTruthy();
  });

  it("keeps maximum progress at the summit when the road is complete", async () => {
    const root = buildColonyRoad(store(0, 0, stopColony(ROAD_STOPS) * 2), () => {}, () => {});
    expect(root.querySelector(".rd-stop.next")).toBeNull();
    expect(root.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"))
      .toBe(String(stopColony(ROAD_STOPS)));
    const body = root.querySelector<HTMLElement>("#achBody");
    if (!body) throw new Error("Missing road scroller");
    Object.defineProperty(body, "scrollHeight", { value: 100_000 });
    await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
    expect(body.scrollTop).toBe(0);
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
   * The Anthill is a DELIBERATE deviation (PROJECT_GUIDE.md §10): it is a cross-section of the
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
    // THE SKELETON IS THE DESIGN'S NOW, not the legacy build's — the third screen drawn
    // to a handed-over frame, after home and the shop. What went with the old one: the
    // rarity WORD on the banner (the tile under it is painted in that rarity and the
    // section is headed with its name), the rule between a heading and its count, and the
    // veil that printed a price on every locked card.
    for (const cls of ["rbanner", "rb-info", "rb-name", "rb-tag", "rb-meta", "rb-seg",
      "an-tile", "an-lv", "antcta", "antscroll", "tierhead", "tiergrp", "tl", "tc",
      "cgrid", "ccard", "cname"]) {
      expect(landmarks(root), `.${cls} missing`).toContain(cls);
    }
    for (const gone of ["rb-tier", "tline", "cveil", "clv"]) {
      expect(landmarks(root), `.${gone} came back with the legacy skeleton`).not.toContain(gone);
    }
    // A card carries the NAME and nothing under it: the stat pair was two unlabelled
    // numbers that read as a level, and both are a tap away as labelled chips.
    expect(landmarks(root), "the bare stat pair is back on the cards").not.toContain("cstat");
    expect(root.querySelector("#antBanner")).toBeTruthy();
    expect(root.querySelector("#antCTA")).toBeTruthy();
    expect(root.querySelector("#antGrid")).toBeTruthy();
  });

  /**
   * NOTHING UNDER THE NAME, INCLUDING ONCE THERE IS RESEARCH.
   *
   * The card used to grow a progress bar the moment a colony had any research — so it
   * showed under some cards and not others, drawing the same number the "LV 15" badge
   * already carries, with no label on it. Two rules under two cards out of eight read as a
   * stray line rather than as a measure of anything.
   */
  it("grows no bar under a card once its colony has research", () => {
    const s = store(100_000, 100_000);
    for (let i = 0; i < 3; i++) s.buyResearch("fire");
    expect(s.get().research.fire?.level).toBe(3);

    const root = buildAntarium(s, { onOpenSpecies: () => {} });
    const card = Array.from(root.querySelectorAll<HTMLElement>(".ccard"))
      .find((c) => c.dataset.ant === "fire");
    // The listing badge carries only purchased upgrades.
    expect(card?.querySelector(".an-lv")?.textContent, "the level badge went with it")
      .toBe("3");
    expect(card?.querySelectorAll(".rb-pip").length, "a card grew the banner's rungs").toBe(0);
    expect(card?.querySelector(".cbar"), "a research bar grew under the name").toBeNull();
    expect(root.querySelector(".cbar"), "a research bar grew under some card").toBeNull();
    // The name is the last thing on the card, so nothing can creep back under it unseen.
    expect(card?.lastElementChild?.className).toBe("cname");
  });

  /**
   * The species page is a DELIBERATE deviation from the legacy skeleton (PROJECT_GUIDE.md §10):
   * the legacy shape was four identical grey cards, and it was the last screen in the app
   * still wearing it. What is held here is the shape it was rebuilt into — and the ids the
   * router and the tour reach it by, which are not styling and must not drift.
   */
  it("keeps the species page’s hero → shared upgrades → ability structure", () => {
    const root = buildSpeciesPage(store(), { species: "fire", onBack: () => {} });
    expect(root.id).toBe("antup");
    for (const cls of ["spgwrap", "spghero", "spgstat", "spgdone", "rb-seg",
      "rb-pip", "spgupgrade", "spgcard", "spgchip", "secthead"]) {
      expect(landmarks(root), `.${cls} missing`).toContain(cls);
    }
    expect(root.querySelector("#aupTitle")?.textContent).toBe("Fire Ant");
    expect(root.querySelector("#aupSub"), "the subtitle is back").toBeNull();
    expect(root.querySelector("#aupBack")).toBeTruthy();
    expect(root.querySelector("#aupPort")).toBeNull();
    expect(root.querySelector("#aupCover img")).toBeTruthy();
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

  /**
   * THE COLONY ROAD IS A DELIBERATE DEVIATION (§10), so what is held here is the part of
   * the legacy skeleton it still wears and the fact that the rest of it is GONE.
   *
   * It kept `road2 → roadchap → roadrow` — two columns of cards either side of a hairline
   * — for as long as it was a port. The screen is a path through ten places now, five
   * checkpoints a chapter, each chapter wearing its own picture; the ladder's classes went
   * WITH the markup rather than being left in `skin.css` dressing selectors nothing emits.
   */
  it("keeps the Colony Road's shell and nothing of its ladder", () => {
    const root = buildColonyRoad(store(), () => {}, () => {});
    expect(root.id).toBe("achievements");
    expect(root.querySelector(".screenbody")?.id).toBe("achBody");
    for (const cls of ["rd-road", "rd-progress", "rd-player", "rd-back"]) {
      expect(landmarks(root), `.${cls} missing`).toContain(cls);
    }
    for (const cls of ["roadhead", "roadhl", "roadsub", "road2", "roadchap", "roadchapter",
      "roadrow", "rcolL", "rcolC", "rcolR", "rnode", "roadcell", "rc-rew", "rc-btn"]) {
      expect(landmarks(root), `.${cls} is back`).not.toContain(cls);
    }
    expect(root.querySelector(".screenbody")?.lastElementChild?.className).toBe("rd-road");
    expect(root.lastElementChild?.classList.contains("rd-back")).toBe(true);
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
  const text = (): string => buildRules(() => {}).textContent ?? "";

  it("covers every rule a player has to be told rather than discover", () => {
    const said = text();
    for (const heading of [
      "How a match is won", "A turn", "Moving and attacking", "What the tiles are worth",
      "Travel and veins", "Supply lines", "Rally and Advance", "The Hive",
      "The colonies", "What you play for",
    ]) {
      expect(said, `nothing about "${heading}"`).toContain(heading);
    }
  });

  /** Ten sections down one scroll: each is numbered, so a reader can see where they are. */
  it("numbers the sections", () => {
    const root = buildRules(() => {});
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
    expect(said).toContain(`turn ${MAPS.small.awakenTurn}`);
    expect(said).toContain(`every ${HIVE_GROW_EVERY} turns`);
    expect(said).toContain(`gone for ${HIVE_COOLDOWN} turns`);
    expect(said).toContain(`${KEEP_NORMAL} soldier`);
  });

  /**
   * The colonies are listed from the species table, not retyped beside it — but the
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
    const root = buildRules(() => {});
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
