/**
 * The progression screens, driven the way a player drives them.
 *
 * jsdom gives no canvas, so portraits come back null — that is deliberate: it proves the
 * screens survive a context they cannot draw into, which is the same failure mode as a
 * hidden tab (CLAUDE.md §10). Everything asserted here is structure and state, never looks.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { CHAMBER_MAX, RESEARCH_MAX, SPECIES, chamberCost, researchCost } from "../../engine";
import type { SpeciesId } from "../../engine";
import {
  COLONY_START, MemoryStore, ProfileStore, ROAD_CHAPTER_STOPS, SPECIES_UNLOCK, compact,
  roadKey, stopColony,
} from "../../platform";
import { buildAnthill } from "../anthill";
import { buildProfile } from "../profile";
import { clockOf, colonyBanner } from "../chrome";
import { buildAntarium, buildSpeciesPage } from "../antarium";
import type { EngineEvent } from "../../engine";
import { dayIndex, questDef } from "../../platform";
import { scoreQuestEvents } from "../app";
import { buildQuests } from "../quests";
import { buildColonyRoad } from "../road";

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
    expect(rooms.length).toBe(Object.keys(CHAMBER_MAX).length);
    expect(rooms[0]?.dataset.chamber).toBe("royal");
    expect(root.textContent).toContain("Royal Chamber");
    expect(root.textContent).toContain("LV 0/5");
    // Alternating sides, so the shaft reads as a tunnel branching rather than a list.
    expect(rooms.map((r) => (r.classList.contains("left") ? "L" : "R")).join(""))
      .toBe("LRLRL");
  });

  /** Unbroken earth on one side, a hollowed-out room on the other. */
  it("tells a dug chamber from ground nobody has touched", () => {
    const s = store(100000);
    s.buyChamber("royal");
    const root = buildAnthill(s);
    const rooms = Array.from(root.querySelectorAll<HTMLElement>(".nest-lvl"));
    expect(rooms[0]?.className, "a dug chamber still read as earth").toContain("dug");
    expect(rooms[1]?.className, "untouched ground read as a room").toContain("fresh");
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
    expect(buyIn(root, ".nest-lvl", "Royal Chamber")?.textContent).toBe("MAX");
    expect(root.querySelector(".nest-lvl")?.className).toContain("maxed");
  });

  /** The whole nest's progress, which the list could never say. */
  it("counts every level dug against every level there is", () => {
    const s = store(100000);
    s.buyChamber("royal");
    s.buyChamber("gland");
    const total = Object.values(CHAMBER_MAX).reduce((a, b) => a + b, 0);
    expect(buildAnthill(s).querySelector(".nest-sum-v")?.textContent).toBe(`2 / ${total}`);
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

describe("species page", () => {
  const openPage = (s: ProfileStore, species: SpeciesId = "fire"): HTMLElement =>
    buildSpeciesPage(s, { species, onBack: () => {} });

  it("names the colony and lists its three research tracks", () => {
    const root = openPage(store());
    expect(root.querySelector("#aupTitle, .screenh")?.textContent).toBe("Fire Ant");
    expect(root.querySelectorAll(".rtrack").length).toBe(3);
    expect(root.textContent).toContain("Wildfire");
    expect(root.textContent).toContain("RESEARCH LV 0 / 15");
  });

  it("buys a research level with mycelium and shows the new one", () => {
    const s = store(researchCost(0));
    const root = openPage(s);
    click(buyIn(root, ".rtrack", "Mandible muscle"));
    expect(s.get().research.fire?.mandible).toBe(1);
    expect(s.get().mycel).toBe(0);
    expect(root.querySelectorAll(".rtrack .pip.on").length).toBe(1);
    expect(root.textContent).toContain("RESEARCH LV 1 / 15");
  });

  it("moves the attack figure only after the research is bought", () => {
    const s = store(100000);
    expect(openPage(s).querySelector(".srow .sv")?.textContent).toBe("0.86");
    s.buyResearch("fire", "mandible");
    expect(openPage(s).querySelector(".srow .sv")?.textContent).toContain("0.90");
  });

  it("shortens the ability cooldown only at maximum reservoir research", () => {
    const s = store(100000);
    const cooldown = (): string | undefined =>
      Array.from(openPage(s).querySelectorAll(".srow")).find((r) => r.textContent?.startsWith("Ability"))
        ?.querySelector(".sv")?.textContent ?? undefined;
    // Read the base off the species rather than writing it in: this is testing the RULE,
    // and a balance tweak to one ability should not fail it.
    const base = SPECIES.fire.ability.cooldown;
    for (let i = 0; i < RESEARCH_MAX - 1; i++) s.buyResearch("fire", "reservoir");
    expect(cooldown()).toContain(`${base}t`);
    s.buyResearch("fire", "reservoir");
    expect(cooldown()).toContain(`${base - 1}t`);
  });

  it("keeps research per species — levelling Fire leaves Ghost alone", () => {
    const s = store(100000);
    s.buyResearch("fire", "cuticle");
    expect(openPage(s, "ghost").textContent).toContain("RESEARCH LV 0 / 15");
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
    expect(withPass.textContent).toContain("PASS \u2713");
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

  it("keeps the species page's hero → dcard skeleton", () => {
    const root = buildSpeciesPage(store(), { species: "fire", onBack: () => {} });
    expect(root.id).toBe("antup");
    for (const cls of ["auptabs", "auptab", "antscroll", "dhero", "dtier", "dname", "dtag",
      "dlvl", "dcard", "ch", "srow", "sk", "sb", "sf", "sv", "dbio", "rtrack", "ri", "rb",
      "rn", "rd", "re", "pips"]) {
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
