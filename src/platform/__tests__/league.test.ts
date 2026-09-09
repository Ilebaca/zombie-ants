/**
 * THE WEEKLY LEAGUE.
 *
 * Every rule in `league.ts` that a screen can quietly stop honouring: the score is a week's
 * GAIN and goes negative on a losing week, fifty colonies of a similar size play it, the
 * top ten are paid on a taper, and a season settles exactly ONCE. That last one is the
 * expensive kind of bug — a prize that pays on every open is the challenge reward all over
 * again (§ CHALLENGES ARE A LADDER).
 */
import { describe, expect, it } from "vitest";
import {
  COLONY_START, LEAGUES, LEAGUE_SIZE, PAID_PLACES, ProfileStore, MemoryStore, chapterOf,
  globalTable, leagueChapters, leagueOf, msLeftInWeek, openSeason, placeOf, prizeFor,
  prizeText, rivals, seasonScore, table, weekIndex,
} from "..";
import { ROAD_LAST } from "../road";
import { SPECIES } from "../../engine";
import type { Season } from "..";

const WEEK = 604_800_000;
const you = (colony: number, name = "Milan") =>
  ({ name, colony, species: "fire" as const });

describe("the leagues", () => {
  it("covers every colony size with exactly one band", () => {
    for (const size of [0, COLONY_START, 999, 1000, 9_999, 1e5, 4.9e6, 1e9]) {
      const d = LEAGUES[leagueOf(size)];
      expect(d, `nothing covers ${size}`).toBeTruthy();
      expect(size >= (d as { min: number }).min, `${size} below its own band`).toBe(true);
    }
  });

  it("runs unbroken from nothing to no ceiling", () => {
    expect(LEAGUES[0]?.min).toBe(0);
    expect(LEAGUES[LEAGUES.length - 1]?.max).toBe(Infinity);
    for (let i = 1; i < LEAGUES.length; i++) {
      expect(LEAGUES[i]!.min, `a gap below ${LEAGUES[i]!.name}`).toBe(LEAGUES[i - 1]!.max);
    }
  });

  /**
   * A band that does not tie back to the road is a second scale to learn. Every band names
   * chapters, they climb with the band, and the top one stops at a chapter somebody can
   * actually reach rather than at infinity.
   */
  it("names chapters that climb with the band and never run off the road", () => {
    let last = 0;
    for (let i = 0; i < LEAGUES.length; i++) {
      const c = leagueChapters(i);
      expect(c.from, LEAGUES[i]!.name).toBeGreaterThanOrEqual(last);
      expect(c.to).toBeGreaterThanOrEqual(c.from);
      expect(Number.isFinite(c.to), `${LEAGUES[i]!.name} runs to infinity`).toBe(true);
      last = c.from;
    }
    expect(leagueChapters(0).from).toBe(chapterOf(COLONY_START));
  });
});

describe("the week", () => {
  it("is the same week for everybody, and turns over on the hour it says", () => {
    const start = 3_000 * WEEK;
    expect(weekIndex(start)).toBe(3_000);
    expect(weekIndex(start + WEEK - 1)).toBe(3_000);
    expect(weekIndex(start + WEEK)).toBe(3_001);
    expect(msLeftInWeek(start)).toBe(WEEK);
    expect(msLeftInWeek(start + WEEK - 1)).toBe(1);
  });
});

describe("the score", () => {
  it("counts what the week GAINED, not what the colony holds", () => {
    const season = openSeason(24_000, 3_000 * WEEK);
    expect(seasonScore(season, 24_000)).toBe(0);
    expect(seasonScore(season, 31_000)).toBe(7_000);
  });

  // A defeat shrinks the colony (§8a), so this falls by itself — which is the whole reason
  // the score is a difference rather than a tally somebody has to remember to decrement.
  it("goes negative on a losing week", () => {
    const season = openSeason(24_000, 3_000 * WEEK);
    expect(seasonScore(season, 21_500)).toBe(-2_500);
  });
});

describe("the table", () => {
  const season: Season = { week: 3_000, startColony: 24_000, league: leagueOf(24_000) };
  const midweek = 3_000 * WEEK + WEEK / 2;

  it("seats fifty colonies, the player among them exactly once", () => {
    const rows = table(season, you(31_000), midweek);
    expect(rows.length).toBe(LEAGUE_SIZE);
    expect(rows.filter((r) => r.you).length).toBe(1);
    expect(rows.find((r) => r.you)?.name).toBe("Milan");
  });

  it("ranks by the week's gain, best first", () => {
    const rows = table(season, you(31_000), midweek);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.score).toBeLessThanOrEqual(rows[i - 1]!.score);
    }
    expect(placeOf(rows)).toBe(rows.findIndex((r) => r.you) + 1);
  });

  // Milan: "players that are in the league together should have similar size troops."
  it("puts the player among colonies of about their own size", () => {
    for (let i = 0; i < LEAGUES.length; i++) {
      const band = LEAGUES[i]!;
      for (const r of rivals(i, 3_000, midweek)) {
        expect(r.colony, `${r.name} is beneath ${band.name}`)
          .toBeGreaterThanOrEqual(Math.max(COLONY_START, band.min));
        if (band.max !== Infinity) expect(r.colony).toBeLessThanOrEqual(band.max);
      }
    }
  });

  // A ladder that reshuffles on every open is not a ladder.
  it("is the same field all week", () => {
    const a = rivals(2, 3_000, midweek).map((r) => r.name);
    const b = rivals(2, 3_000, midweek).map((r) => r.name);
    expect(a).toEqual(b);
    expect(rivals(2, 3_001, midweek).map((r) => r.name)).not.toEqual(a);
  });

  // The table is something to climb, not a picture taken on Monday: the rivals reveal
  // their gains across the week, so a player who plays on Tuesday passes people.
  it("lets the field's scores grow as the week runs", () => {
    const early = rivals(2, 3_000, 3_000 * WEEK + WEEK * 0.1);
    const late = rivals(2, 3_000, 3_000 * WEEK + WEEK * 0.9);
    const grown = late.filter((r, i) => r.score > (early[i] as { score: number }).score);
    expect(grown.length).toBeGreaterThan(LEAGUE_SIZE / 2);
  });

  // A premium colony on the ladder is a shop window, not a player.
  it("gives every rival a colony of their own, none of them premium", () => {
    const field = rivals(3, 3_000, midweek);
    for (const r of field) expect(SPECIES[r.species]?.premium, r.species).toBeFalsy();
    expect(new Set(field.map((r) => r.species)).size).toBeGreaterThan(1);
  });
});

describe("the prizes", () => {
  it("pays the top ten and nobody else", () => {
    for (let place = 1; place <= PAID_PLACES; place++) {
      expect(prizeFor(place), `${place} unpaid`).toBeTruthy();
    }
    expect(prizeFor(PAID_PLACES + 1)).toBeNull();
    expect(prizeFor(LEAGUE_SIZE)).toBeNull();
    expect(prizeFor(0)).toBeNull();
  });

  // "top 3 places should be best rewards and then less and less, ofc first place the best"
  it("tapers, and first place is the best of them", () => {
    const worth = (place: number): number => {
      const p = prizeFor(place);
      return p ? (p.mycel ?? 0) + (p.pheromone ?? 0) * 2 + (p.larva ?? 0) * 60 : 0;
    };
    for (let place = 2; place <= PAID_PLACES; place++) {
      expect(worth(place), `${place} pays more than ${place - 1}`)
        .toBeLessThanOrEqual(worth(place - 1));
    }
    expect(worth(1)).toBeGreaterThan(worth(2));
    expect(worth(2)).toBeGreaterThan(worth(4));
    expect(worth(3)).toBeGreaterThan(worth(PAID_PLACES));
  });

  it("says what it pays in words, in currencies rather than glyphs", () => {
    const text = prizeText(prizeFor(1)!);
    expect(text).toContain("mycelium");
    expect(text).toContain("pheromone");
    expect(text).toContain("larva");
  });
});

describe("settling a season", () => {
  const store = (colony: number): ProfileStore => {
    const s = new ProfileStore(new MemoryStore());
    s.update((p) => { p.colony = colony; });
    return s;
  };

  it("opens a season on first ask and keeps it for the week", () => {
    const s = store(24_000);
    const first = s.season(3_000 * WEEK);
    expect(first.week).toBe(3_000);
    expect(first.startColony).toBe(24_000);
    s.update((p) => { p.colony = 30_000; });
    expect(s.season(3_000 * WEEK + WEEK / 2)).toEqual(first);
  });

  it("settles nothing while the week is still running", () => {
    const s = store(24_000);
    s.season(3_000 * WEEK);
    expect(s.rollSeason(3_000 * WEEK + WEEK - 1)).toBeNull();
  });

  /** The rule that makes it a reward rather than a faucet. */
  it("pays exactly once, however many times the screen is opened", () => {
    const s = store(24_000);
    s.season(3_000 * WEEK);
    s.update((p) => { p.colony = 1e9; });  // a week nobody could beat
    // `get()` hands back the live profile, so the reading has to be taken as a NUMBER.
    const before = s.get().mycel;
    const paid = s.rollSeason(3_001 * WEEK);
    expect(paid, "the week never settled").toBeTruthy();
    expect(paid!.place).toBe(1);
    expect(s.get().mycel).toBeGreaterThan(before);
    const after = s.get().mycel;
    expect(s.rollSeason(3_001 * WEEK)).toBeNull();
    expect(s.rollSeason(3_001 * WEEK + 1)).toBeNull();
    expect(s.get().mycel).toBe(after);
  });

  it("opens the next week from what the colony is worth now", () => {
    const s = store(24_000);
    s.season(3_000 * WEEK);
    s.update((p) => { p.colony = 31_000; });
    s.rollSeason(3_001 * WEEK);
    const next = s.season(3_001 * WEEK);
    expect(next.week).toBe(3_001);
    expect(next.startColony).toBe(31_000);
    expect(seasonScore(next, 31_000)).toBe(0);
  });

  it("pays nothing for a week outside the top ten, and still reports it", () => {
    const s = store(24_000);
    s.season(3_000 * WEEK);
    const before = { mycel: s.get().mycel, larva: s.get().larva };
    const done = s.rollSeason(3_001 * WEEK);   // gained nothing all week
    expect(done?.prize).toBeNull();
    expect(done?.place).toBeGreaterThan(PAID_PLACES);
    expect(s.get().mycel).toBe(before.mycel);
    expect(s.get().larva).toBe(before.larva);
  });

  // Saves outlive code (§12): the season is three numbers a hand-edited save can wreck.
  it("survives a malformed season on the save", () => {
    const disk = new MemoryStore();
    const s = new ProfileStore(disk);
    s.update((p) => {
      (p as { season: unknown }).season = { week: "soon", startColony: -5, league: 900 };
    });
    const back = new ProfileStore(disk);
    const season = back.season(3_000 * WEEK);
    expect(season.week).toBe(3_000);
    expect(season.league).toBeLessThan(LEAGUES.length);
    expect(Number.isFinite(season.startColony)).toBe(true);
  });
});

describe("the whole-server list", () => {
  it("lists every colony biggest first, the player among them once", () => {
    const rows = globalTable(you(24_000));
    expect(rows.filter((r) => r.you).length).toBe(1);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.colony).toBeLessThanOrEqual(rows[i - 1]!.colony);
    }
  });

  // "shows what chapter they are on. only that." — and the chapter has to be the colony's
  // own, off the same function the road uses, or two screens disagree about one player.
  it("gives every colony the chapter its size puts it on", () => {
    for (const r of globalTable(you(24_000))) {
      expect(r.chapter, r.name).toBe(chapterOf(r.colony));
    }
  });

  it("is the same list every time it is opened", () => {
    expect(globalTable(you(24_000)).map((r) => r.name + r.colony))
      .toEqual(globalTable(you(24_000)).map((r) => r.name + r.colony));
  });

  it("spans the whole road rather than clustering around the player", () => {
    const rows = globalTable(you(24_000)).filter((r) => !r.you);
    expect(rows[0]!.colony).toBeGreaterThan(1e6);
    expect(rows[rows.length - 1]!.colony).toBeLessThan(500);
  });

  /**
   * THE TOP OF THE LIST HAS TO SAY SOMETHING. The road ends at five million, so a table
   * topping out past it gave its first seven rows the same chapter — the one fact this
   * tab exists to carry, blank at the end everybody looks at first.
   */
  it("does not stack the top of the table on the road's last chapter", () => {
    const top = globalTable(you(24_000)).slice(0, 10);
    expect(new Set(top.map((r) => r.chapter)).size).toBeGreaterThan(2);
    expect(top[0]!.colony).toBeLessThanOrEqual(ROAD_LAST);
  });
});
