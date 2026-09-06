/**
 * ATTACKING THE APP ON PURPOSE.
 *
 * Almost every item on a "secure your app before launch" list is about a BACKEND — row-level
 * security, admin routes, SQL injection, storage buckets, auth sessions, rate limits. This
 * game has none of those, and that is not a gap to be proud of so much as a consequence: it
 * is a static bundle and a save on the device, with no server anywhere (roadmap §9).
 *
 * Two things on such a list DO apply to a client-only app, and they are the two asserted
 * here — because they are the two that would still be true the day a server arrives:
 *
 *  1. TEXT A PLAYER TYPES MUST NEVER BECOME MARKUP. The colony name is printed on half the
 *     screens in the app and drawn on the board beside the nest. Everything is built with
 *     DOM calls rather than `innerHTML` (`ui/chrome.ts` says so), which is what makes this
 *     safe — but "we don't use innerHTML" is a habit, and a habit is exactly the thing that
 *     lapses. This holds the outcome instead of the habit.
 *  2. A SAVE IS A STRING THE PLAYER CAN REWRITE, and `normalise` is the trust boundary
 *     (CLAUDE.md §12). It cannot stop somebody giving themselves currency in their own
 *     single-player game and does not try to; what it must do is stop a hand-edited save
 *     producing a `NaN` chamber level that silently distorts combat maths, or a shape that
 *     crashes a screen. The clamps are the point, not the ceiling.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { MemoryStore, ProfileStore, TOUR_VERSION, normalise, defaultProfile } from "../../platform";
import { App } from "../app";
import { buildSettings } from "../settings";
import { buildLeaderboard } from "../leaderboard";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });

/** Markup, an event handler and both kinds of quote, in the one field a player types into. */
const NASTY = `<img src=x onerror="boom()"><script>boom()</script>'"&`;

describe("text a player types never becomes markup", () => {
  const named = (): ProfileStore => {
    const s = new ProfileStore(new MemoryStore());
    s.update((p) => { p.name = NASTY; p.tourSeen = TOUR_VERSION; p.colony = 2_000_000; });
    return s;
  };

  /** Nothing the name can contain may produce an ELEMENT. If it is on screen it is text. */
  it("prints a hostile colony name as text, on every screen that shows it", () => {
    const host = document.createElement("div");
    host.id = "app";
    document.body.appendChild(host);
    const app = new App(host, named());
    app.start();

    for (const tab of ["shop", "anthill", "antarium", "challenges", "home"]) {
      host.querySelector<HTMLButtonElement>(`[data-nav='${tab}']`)?.click();
      expect(host.querySelector("img"), `an element was injected on ${tab}`).toBeNull();
      expect(host.querySelector("script"), `a script was injected on ${tab}`).toBeNull();
    }
    app.destroy();
  });

  it("survives the name on the screens that print it back", () => {
    for (const build of [
      () => buildSettings({
        profile: named(), onBack: () => {}, board: "Corridor (9×9)", difficulty: "Normal",
        onCycleBoard: () => {}, onCycleDifficulty: () => {}, onHowToPlay: () => {},
        onFeedbackChanged: () => {}, onReplayTutorial: () => {}, onReset: () => {},
        onDelete: () => {}, onSignOut: () => {}, onKeepSafe: () => {}, onRestored: () => {},
        playerCode: "ZA-TEST-TEST",
      }),
      () => buildLeaderboard({ name: NASTY, colony: 2_000_000, species: "fire" }, () => {}),
    ]) {
      const root = build();
      document.body.replaceChildren(root);
      expect(root.querySelector("img"), "an element was injected").toBeNull();
      expect(root.querySelector("script")).toBeNull();
    }
  });

  /**
   * THE HABIT ITSELF, held once. Every screen builds DOM nodes; the single `innerHTML` in
   * the app is the match screen's static markup, which contains no data at all.
   */
  it("puts no data through innerHTML anywhere", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join, resolve } = await import("node:path");
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) { if (name !== "__tests__") walk(path, out); }
        else if (name.endsWith(".ts")) out.push(path);
      }
      return out;
    };
    const offenders: string[] = [];
    for (const file of walk(resolve(__dirname, "../.."))) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        // A comment about innerHTML is documentation; an assignment is the risk.
        const t = line.trim();
        if (t.startsWith("*") || t.startsWith("//")) continue;
        if (/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/.test(line)) {
          // The one allowed use: a constant with no interpolation in it.
          if (/innerHTML = [A-Z_]+;/.test(t)) continue;
          offenders.push(`${file}: ${t}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("a save somebody has rewritten by hand", () => {
  /**
   * The whole point of the trust boundary: rubbish in every field at once, and what comes
   * out is a profile the game can run on. Not the player's edits refused — that is not what
   * this is for — but nothing that could reach `fight()` as a NaN.
   */
  it("turns a hostile save into a playable one rather than crashing", () => {
    const junk = {
      name: NASTY,
      colony: -999_999, mycel: "banana", pheromone: NaN, larva: Infinity,
      hill: { barracks: 9999, granary: -5, nonsense: 3 },
      research: { fire: { mandible: 500 } },
      unlocked: null, tourSeen: 99,
      traits: { bag: [{ uid: 1, id: "nope", tier: "godlike" }] },
      skins: ["not-a-skin"], look: { fire: "stolen" },
      history: [{ record: "not-an-object" }],
      stats: { games: "many" },
    } as unknown;

    const p = normalise(junk);
    const base = defaultProfile();

    // NOTHING may come out as NaN or Infinity: that is the failure that would reach combat
    // maths and distort it silently rather than loudly.
    const numbers = [p.colony, p.mycel, p.pheromone, p.larva,
      ...Object.values(p.hill), ...Object.values(p.research.fire ?? {})];
    for (const n of numbers) expect(Number.isFinite(n), `${n} is not a finite number`).toBe(true);

    expect(p.colony, "a negative colony survived").toBeGreaterThanOrEqual(base.colony);
    expect(p.mycel).toBe(0);
    expect(p.larva).toBeLessThanOrEqual(1e9);
    // Levels are clamped to their caps, or a hand-edited save doubles a colony's punch.
    for (const [id, level] of Object.entries(p.hill)) {
      expect(level, `chamber ${id} is above any sane cap`).toBeLessThanOrEqual(20);
      expect(level, `chamber ${id} went negative`).toBeGreaterThanOrEqual(0);
    }
    for (const [id, level] of Object.entries(p.research.fire ?? {})) {
      expect(level, `research ${id} is above its cap`).toBeLessThanOrEqual(10);
      expect(level).toBeGreaterThanOrEqual(0);
    }
    // A player must always have something to field, however stripped the save was.
    expect(p.unlocked.length).toBeGreaterThan(0);
    // Items and looks that do not exist are dropped rather than carried.
    expect(p.skins).toEqual([]);
    expect(Object.keys(p.look)).toEqual([]);
  });

  it("opens the app on a save that is not even an object", () => {
    for (const bad of ["null", "[]", '"a string"', "42", "{", ""]) {
      const store = new MemoryStore();
      store.set("zombie-ants.profile", bad);
      const host = document.createElement("div");
      host.id = "app";
      document.body.replaceChildren(host);
      const app = new App(host, new ProfileStore(store));
      expect(() => app.start(), `a save of ${bad} took the app down`).not.toThrow();
      app.destroy();
    }
  });
});
