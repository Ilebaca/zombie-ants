/**
 * EVERY SCREEN IN THE GAME, ON A 360x800 PHONE.
 *
 * The page half of `tools/shots.ts` — see that file for why this exists. It drives the
 * REAL app: one `App`, one `ProfileStore`, the real router, the real deck, the real match
 * screen and the real guided tour. Nothing here redraws a screen for the export, so a
 * shot cannot be a picture of something the game no longer has.
 *
 * A SCENE IS A NAME AND A WAY TO GET THERE. The driver asks for them one at a time, waits
 * for the screen to settle and takes the viewport; `scroll()` is what gets the rest of a
 * screen that is taller than a phone, in the same 360x800 frame rather than a stretched
 * one.
 *
 * It reaches past a few `private` fields (`app["show"]`, `app["tour"]`) on purpose. The
 * alternative is clicking a path through the UI for all seventy of them, which is a second
 * description of the app's navigation and the one that goes stale; the router is still what
 * builds every screen either way.
 *
 * TOOL, NOT BUILD STEP: excluded from the typecheck and the lint like `tools/mapshot` is,
 * which is also why the casts below are written the short way.
 */
/* eslint-disable */
import {
  LocalAccounts, MemoryStore, ProfileStore, TOUR_VERSION, catchCrashes, resetCrash,
} from "../../src/platform";
import { App } from "../../src/ui/app";
import { buildResultCard } from "../../src/ui/result";
import {
  SPECIES, actionTargets, applyMove, createGame, seeded, tilesOwnedBy,
} from "../../src/engine";

const host = document.getElementById("app") as HTMLElement;
const splash = document.getElementById("splash") as HTMLElement;
const rotate = document.getElementById("rotate") as HTMLElement;

const ALL = Object.keys(SPECIES) as any[];

/* ------------------------------------------------------------------ THE COLONY */

/**
 * A colony far enough along that every screen has something on it.
 *
 * Chapter 20-odd: every colony owned, chambers and research part-bought (so the NOW/NEXT
 * rows have both halves), traits found and some worn, two skins, a few matches behind it.
 * An empty save would export two dozen screens of "nothing here yet".
 */
function dress(store: ProfileStore): void {
  store.update((p: any) => {
    p.name = "Milan";
    p.tourSeen = TOUR_VERSION;
    p.colony = 148_000;
    p.mycel = 5_240;
    p.pheromone = 3_180;
    p.larva = 6;
    p.unlocked = [...ALL];
    p.hill = { royal: 2, brood: 3, soldierCaste: 1, gland: 2, cultivate: 1 };
    p.research = {
      leafcutter: { reservoir: 3, caste: 2, mandible: 1 },
      fire: { reservoir: 1, caste: 1 },
      carpenter: { mandible: 2 },
    };
    p.pass = true;
    p.xp = 48_000;
    p.questStreak = 4;
    p.stats = {
      games: 86, wins: 47, conquered: 612, abilities: 133, tunnels: 19,
      winStreak: 3, bestStreak: 7, turns: 3_914, playedMs: 21_600_000,
      bestMs: 362_000, queens: 12, nests: 6,
    };
    p.fav = { leafcutter: 31, fire: 18, army: 12 };
    p.challenges = ["hold"];
    p.granary = 4;
    p.granaryAt = Date.now() - 1000 * 60 * 60 * 30;   // a full store waiting on home
    p.backupAt = 0;
    // Deterministic: every match scene is the same colony with the same ability.
    p.lastSpecies = "leafcutter";
    p.lastShape = "wedge";
  });

  // TRAITS AND SKINS COME OUT OF THE HATCH, not out of a hand-written bag: `hatch()` is
  // what mints a uid and respects the pool, so the inventory shows items the game could
  // actually have paid out. The generator is seeded, so the export is the same every run.
  const rng = seeded(90210);
  store.update((p: any) => { p.larva = 40; });
  for (let i = 0; i < 34; i++) store.hatch(rng);
  store.update((p: any) => { p.larva = 6; });

  // And a few of them worn, on the anthill's bench and on two colonies.
  for (const scope of ["hill", "leafcutter", "fire"] as any[]) {
    const spare = store.spare(scope).slice(0, 3);
    for (const item of spare) store.equipTrait(scope, item.uid);
  }
  // A skin on the colony the Antarium opens on, so the picker shows a worn one.
  const found = store.get().skins;
  if (found.length) store.wearSkin(("leafcutter") as any, found[0] as string);

  for (const log of pastMatches()) store.rememberMatch(log);
}

/**
 * Matches to put in the history list, one of them watchable.
 *
 * The replayable one's moves are PLAYED rather than typed: `applyMove` is the engine's own
 * door (§9b), so every move in the record is one the board really accepted and the replay
 * screen cannot open on a position the game could not reach.
 */
function pastMatches(): any[] {
  const now = Date.now();
  const rows: any[] = [
    {
      id: "m1", at: now - 1000 * 60 * 40, map: "small", you: "leafcutter", foe: "fire",
      foeName: "Ironjaw", human: false, winner: "you", reason: "nest", turns: 44,
      playedMs: 486_000, colonyBefore: 141_000, colonyAfter: 148_000,
      record: playedRecord(),
    },
    {
      id: "m2", at: now - 1000 * 60 * 60 * 6, map: "small", you: "fire", foe: "army",
      foeName: "Redcap", human: false, winner: "ai", reason: "nest", turns: 38,
      playedMs: 402_000, colonyBefore: 143_500, colonyAfter: 141_000,
    },
    {
      id: "m3", at: now - 1000 * 60 * 60 * 30, map: "small", you: "army", foe: "ghost",
      foeName: "Palewing", human: true, winner: "you", reason: "surrender", turns: 51,
      playedMs: 560_000, colonyBefore: 137_000, colonyAfter: 143_500,
    },
  ];
  return rows;
}

function playedRecord(): any {
  const setup = {
    map: "small" as const,
    species: { you: "leafcutter", ai: "fire" } as any,
    seed: 0xb0a4d,
    first: "you" as const,
  };
  const state = createGame({ ...setup });
  const moves: any[] = [];
  const play = (mv: any): boolean => {
    const res = applyMove(state, state.current, mv);
    if (res.ok) moves.push(mv);
    return res.ok;
  };
  for (let turn = 0; turn < 26 && !state.over; turn++) {
    const me = state.current;
    for (const t of tilesOwnedBy(state, me)) {
      const to = actionTargets(state, t)
        .find((v) => Math.abs(v.c - t.c) + Math.abs(v.r - t.r) === 1);
      if (to && play({ do: "move", from: { c: t.c, r: t.r }, to })) break;
    }
    if (state.current === me) play({ do: "end" });
  }
  return { setup, moves };
}

/* -------------------------------------------------------------------- THE APP */

let app: any = null;

/** Tear down whatever is on screen and open a fresh app on a fresh save. */
function open(opts: { dressed?: boolean; signin?: boolean } = {}): void {
  app?.destroy?.();
  host.replaceChildren();
  const store = new ProfileStore(new MemoryStore());
  if (opts.dressed !== false) dress(store);
  app = opts.signin
    // No profile handed in and no account signed in: the shell opens the picker, which is
    // the one screen a store passed straight in can never show (platform/accounts.ts).
    ? new App(host, undefined, new LocalAccounts(new MemoryStore()))
    : new App(host, store);
  app.start();
}

const go = (id: string) => () => { app.show(id); };

const clickText = (re: RegExp, scope: ParentNode = host): void => {
  const hit = Array.from(scope.querySelectorAll("button"))
    .find((b) => re.test(b.textContent ?? ""));
  hit?.click();
};
const click = (sel: string): void => {
  host.querySelector<HTMLElement>(sel)?.click();
};

/* ------------------------------------------------------------------- THE TOUR */

/**
 * Walk the guided tour on by one step. The driver shoots between every call.
 *
 * It answers FALSE once the walk has ended, so the number of steps is the tour's business
 * rather than a count written down here — a second list of how many steps there are is a
 * list that goes stale the first time one is added.
 */
const tourNext = (): boolean => {
  app.tour.next();
  return !!app.tour.running;
};

/**
 * Wait for the board to be the player's to act on.
 *
 * The opening camera, the AI's reply and the fill all take real time, and a press that
 * lands during any of them is refused exactly as a player's would be — which is a shot of
 * a screen where nothing happened.
 */
function yourTurn(ms = 15_000): Promise<boolean> {
  const until = Date.now() + ms;
  return new Promise((done) => {
    const look = (): void => {
      const m = app.match;
      if (m && !m.state.over && !m.introTimer && m.state.current === "you") { done(true); return; }
      if (Date.now() > until) { done(false); return; }
      setTimeout(look, 120);
    };
    look();
  });
}

/* ----------------------------------------------------------------- THE SCENES */

interface Scene {
  name: string;
  /** `false` means there was nothing to shoot — the driver skips the frame entirely. */
  set: () => void | boolean | Promise<void | boolean>;
  /** Extra milliseconds before the shot. The default covers a rebuild and a frame. */
  wait?: number;
  /** Don't try to scroll this one for more frames (a board, an overlay). */
  still?: boolean;
}

const SCENES: Scene[] = [];
const scene = (name: string, set: Scene["set"], extra: Partial<Scene> = {}): void => {
  SCENES.push({ name, set, ...extra });
};

/* The cover over a cold boot, before anything else exists. */
scene("00-splash", () => {
  app?.destroy?.();
  host.replaceChildren();
  splash.classList.remove("off");
}, { still: true });

/* Signing in: the roster, on a device with no colony on it. */
scene("01-signin", () => { splash.classList.add("off"); open({ signin: true }); });

/* THE GUIDED TOUR, META HALF — one shot per step, which is what was asked for. */
scene("02-tour-meta-01", () => {
  open({ dressed: false });
  // A save with no `tourSeen` starts the walk by itself (App.start), so this is the first
  // thing a new player ever sees.
}, { still: true });
for (let i = 2; i <= 12; i++) {
  scene(`02-tour-meta-${String(i).padStart(2, "0")}`, tourNext, { still: true, wait: 420 });
}

/* THE GUIDED TOUR, MATCH HALF. The board is the arranged one (engine/tutorial.ts). */
scene("03-tour-match-01", () => {
  // Straight to the tutorial match rather than through the last meta step: `startMatch`
  // reads `tourSeen` to decide whether this is the tutorial, so the walk and the arranged
  // board both come up exactly as they do in the game.
  app.tour.stop();
  app.startMatch();
}, { still: true, wait: 4200 });
for (let i = 2; i <= 12; i++) {
  scene(`03-tour-match-${String(i).padStart(2, "0")}`, tourNext, { still: true, wait: 900 });
}

/* HOME, and the two things that ride on it. */
scene("10-home", () => { open(); }, { wait: 900 });
scene("11-home-drawer", () => { click(".settingsfab"); });
scene("12-whats-new", () => {
  // The card a returning player meets. Nothing has been read, so every major post is new.
  app.show("home");
  app.profile.update((p: any) => { p.newsSeen = 0; });
  app.showWhatsNew();
}, { still: true });

/* THE FIVE DECK SCREENS, through the bottom bar the player uses. */
scene("13-shop", () => { app.clearOverlay(); click("[data-nav='shop']"); });
scene("14-anthill", () => { click("[data-nav='anthill']"); });
scene("15-antarium", () => { click("[data-nav='antarium']"); });
scene("16-challenges", () => { click("[data-nav='challenges']"); });
scene("17-daily", go("daily"));

/* SETTING A MATCH UP: one screen, two steps. */
scene("20-setup-formation", go("formation"), { wait: 600 });
scene("21-setup-colony", () => { clickText(/next/i); }, { wait: 600 });
scene("22-setup-invitation", () => {
  // The invitation band rides this screen: it has already settled who the opponent is.
  app.show("home");
  app.profile.update((p: any) => { p.duelsIn = [{
    id: "inv1", from: { id: "p9", name: "Longshanks", colony: 162_000, species: "army" },
    at: Date.now() - 90_000,
  }]; });
  app.show("formation");
}, { wait: 600 });

/* FINDING SOMEBODY TO PLAY. */
scene("23-matchmaking", () => { app.findOpponent(); }, { still: true, wait: 1600 });

/* A MATCH. */
scene("30-match-opening", () => {
  app.clearMatchmaking?.();
  app.startMatch();
}, { still: true, wait: 1200 });
scene("31-match-board", () => yourTurn(), { still: true, wait: 900 });
scene("32-match-selected", async () => {
  // A tile picked up: the cells it can reach are marked and the action bar wakes up.
  await yourTurn();
  const m = app.match;
  const nest = m.state.grid.flat()
    .find((t: any) => t.owner === "you" && t.struct === "nest");
  m.select({ c: nest.c, r: nest.r });
}, { still: true, wait: 600 });
scene("33-match-ability", async () => {
  // The real button, so the real card: it holds the clock and the screen while it plays.
  await yourTurn();
  click("#bAbility");
}, { still: true, wait: 500 });
scene("34-match-surrender", async () => {
  await yourTurn();
  // The card is still up and the screen is deliberately inert under it, so let it go
  // first — otherwise this press is refused exactly as a player's would be.
  app.match.release();
  click("#bSurr");
}, { still: true, wait: 400 });

/* THE RESULT CARD, both ways round. */
scene("35-result-win", () => { card("you"); }, { still: true });
scene("36-result-lose", () => { card("ai"); }, { still: true });

function card(winner: string): void {
  app.clearOverlay?.();
  const won = winner === "you";
  const ov = buildResultCard(winner as any, {
    turns: 44,
    played: 486_000,
    youArmy: won ? 96 : 12,
    species: "leafcutter" as any,
    xpGained: won ? 120 : 40,
    colony: won ? 148_000 : 141_000,
    colonyDelta: won ? 7_300 : -2_600,
    mycel: won ? 86 : 30,
    larva: won ? 1 : 0,
    leveledTo: won ? 24 : null,
    reason: "nest" as any,
    challenge: null,
  } as any, { onAgain: () => {}, onChangeColony: () => {}, onHome: () => {} });
  host.appendChild(ov);
  app.overlay = ov;
}

/* THE CAREER. */
scene("40-profile", () => { open(); app.show("profile"); }, { wait: 500 });
scene("41-quests", go("quests"));
scene("42-colony-road", go("achievements"));
scene("43-history", go("history"));
scene("44-replay", () => {
  const log = app.profile.get().history.find((h: any) => h.record?.moves?.length);
  app.watch(log);
}, { still: true, wait: 1500 });

/* THE LADDER. */
scene("50-leaderboard-week", () => { app.show("leaderboard"); }, { wait: 400 });
scene("51-leaderboard-global", () => { host.querySelectorAll<HTMLElement>(".lbtab")[1]?.click(); });

/* A COLONY'S OWN PAGE, one per species: this is where research and skins are bought. */
for (const id of ALL) {
  scene(`6${ALL.indexOf(id)}-colony-${id}`, () => {
    app.speciesPage = id;
    app.show("antup");
  }, { wait: 400 });
}

/* TRAITS, THE BENCHES AND THE BAG. */
scene("70-traits-anthill", () => { app.openTraits("hill", "anthill"); }, { wait: 400 });
scene("71-traits-colony", () => { app.openTraits("leafcutter", "antarium"); }, { wait: 400 });
scene("72-inventory", go("inventory"));
scene("73-lucky-hatch", go("luckyhatch"));

/* THE DRAWER'S OWN SCREENS. */
scene("80-news", go("news"));
scene("81-friends", go("friends"));
scene("82-friends-requests", () => { click(".frtab[data-tab='requests']"); });
scene("83-friends-find", () => { click(".frtab[data-tab='find']"); });
scene("84-support", go("support"));
scene("85-settings", go("settings"));
scene("86-settings-save-code", () => { clickText(/show|code/i); }, { wait: 400 });
scene("87-keep-safe", go("keepsafe"));
scene("88-how-to-play", go("rules"), { wait: 600 });

/* THE TWO SCREENS NOBODY WANTS TO SEE. */
scene("90-rotate", () => {
  open();
  rotate.style.setProperty("display", "flex", "important");
}, { still: true, wait: 700 });
scene("91-crash", () => {
  rotate.style.removeProperty("display");
  open();
  // The panel is put up by the real handler, so this is the screen a player would meet.
  // `resetCrash` first: it shows ONCE per session, and this export has run for a while.
  resetCrash();
  catchCrashes();
  // The real panel, put up by the real handler (platform/crash.ts).
  window.dispatchEvent(new ErrorEvent("error", {
    message: "Export sample — this is what a thrown error looks like",
    error: new Error("Export sample"),
  }));
}, { still: true });

/* --------------------------------------------------------------- THE DRIVER'S API */

/**
 * SCROLL THE SCREEN ON BY ONE FRAME, if it has more to show.
 *
 * A phone-shaped shot of a screen taller than a phone is the top of it and nothing else,
 * and the shop, the manual and the Colony Road are all several screens long. Finding the
 * scroller by asking which element IS scrollable is the same rule `chrome.ts`'s `redraw`
 * follows — a list of the dozen scroller class names here would be a thirteenth place to
 * keep in step.
 */
function scrollOn(): boolean {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const boxes = Array.from(host.querySelectorAll<HTMLElement>("*"))
    .filter((e) => e.scrollHeight > e.clientHeight + 8 && e.clientHeight > 180)
    .filter((e) => {
      const o = getComputedStyle(e).overflowY;
      return o === "auto" || o === "scroll";
    })
    // AND IT HAS TO BE THE ONE ON SCREEN. The deck keeps all five slides in the document
    // at once (ui/deck.ts), so "the last scroller in the markup" is the Challenges screen
    // whichever tab is showing — the shop scrolled a page nobody could see and handed
    // back the same frame twice.
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.left < w - 8 && r.right > 8 && r.top < h - 8 && r.bottom > 8;
    });
  const box = boxes[boxes.length - 1];
  if (!box) return false;
  const was = box.scrollTop;
  const step = Math.max(120, box.clientHeight - 48);
  // DOWN, UNLESS THERE IS NOTHING BELOW. The Colony Road opens at the rung the player is
  // standing on, which is the bottom of its scroller — so a screen that only ever scrolls
  // downwards hands back one frame of a road a hundred rungs long and calls it done.
  //
  // AND THE DIRECTION IS DECIDED ONCE PER SCREEN. Turning round at the end instead walks
  // back up over frames that have already been taken: six shots of a three-frame screen,
  // none of them next to its own duplicate, so nothing downstream can tell.
  if (!dir) dir = was + box.clientHeight < box.scrollHeight - 8 ? 1 : -1;
  box.scrollTop = was + step * dir;
  return Math.abs(box.scrollTop - was) > 8;
}

/** Which way the screen on show is being walked. Reset as each scene opens. */
let dir = 0;

(window as any).shots = {
  names: SCENES.map((s) => s.name),
  meta: SCENES.map((s) => ({ wait: s.wait ?? 260, still: !!s.still })),
  run(i: number): any { dir = 0; return SCENES[i]?.set(); },
  scroll: scrollOn,
};
(window as any).shotsReady = true;
