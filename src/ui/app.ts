/**
 * App shell: home → map → species → formation → match → result.
 *
 * Meta screens own *choices*; the engine owns rules. Nothing here reaches into a running
 * match — a match is created from the choices, handed to MatchScreen, and reported back
 * through `onExit`.
 */
import {
  MAPS, SPECIES, START_SHAPES, armyOf, arrangeTutorial, createGame,
} from "../engine";
import type { EngineEvent, GameOverReason, MapId, Player, SpeciesId } from "../engine";
import type { Difficulty } from "../ai/search";
import type { ShapeId } from "../engine";
import { DEFAULT_SPECIES, DemoGateway, ProfileStore, SPECIES_ORDER, TOUR_VERSION } from "../platform";
import type { PurchaseGateway } from "../platform";
import { SPECIES_COL, antHead, basicLook, hexA, setFactionColor } from "../render";
import { buildAnthill } from "./anthill";
import { buildAntarium, buildSpeciesPage } from "./antarium";
import { buildProfile } from "./profile";
import { icon } from "./icons";
import { NAV_SCREENS, bottomNav, clockOf, el, setupSteps, toast, topBar } from "./chrome";
import type { NavId } from "./chrome";
import { MatchScreen } from "./match";
import {
  CHALLENGES, CHALLENGE_REWARD, DAILY_BONUS_PHEROMONE, GOAL_TEXT, buildChallenges, buildDaily,
} from "./challenges";
import type { Challenge } from "./challenges";
import { buildLeaderboard } from "./leaderboard";
import { buildShop } from "./shop";
import { buildQuests } from "./quests";
import { buildComingSoon, buildMenu, buildRules, buildSettings } from "./screens-simple";
import { buildTrophyRoad } from "./road";
import { Deck } from "./deck";
import { Tour } from "./tour";
import type { TourStep } from "./tour";
import "./game.css";
import "./skin.css";   // the look, layered over the structure

/**
 * Route ids are the legacy build's screen ids. The stylesheet is that build's, and some of
 * its rules select by id, so these names are load-bearing.
 */
type ScreenId =
  | "home" | "mapsel" | "start" | "formation"
  | "anthill" | "antarium" | "antup" | "achievements" | "quests" | "profile"
  | "challenges" | "daily" | "rules" | "settings" | "news" | "friends" | "support"
  | "leaderboard" | "shop";

/**
 * The five screens on the deck, in the order the bottom bar lists them. Home sits in the
 * middle, so it is one swipe from everything.
 */
const DECK = ["shop", "anthill", "home", "antarium", "challenges"] as const;
type DeckId = (typeof DECK)[number];
const isDeck = (id: string): id is DeckId => (DECK as readonly string[]).includes(id);

const MAP_ORDER: readonly MapId[] = ["tiny", "small", "mid"];

/** Short names for the settings screen, as the legacy build labels them. */
const MAP_LABEL: Record<MapId, string> = { tiny: "Skirmish", small: "Corridor", mid: "Gauntlet" };
const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

/** Setup choices that survive between matches. */
interface Choices {
  map: MapId;
  species: SpeciesId;
  shape: ShapeId;
}

export class App {
  private screens = new Map<ScreenId, HTMLElement>();
  private match: MatchScreen | null = null;
  private overlay: HTMLElement | null = null;
  private nav: HTMLElement | null = null;
  /** Which colony the #antup page is showing. */
  private speciesPage: SpeciesId = "leafcutter";
  private menu: HTMLElement | null = null;
  /** The five-tab deck. Built on first use, then it outlives every screen. */
  private deck: Deck<DeckId> | null = null;
  /** Read from the profile at boot — a setting that forgets itself is not a setting. */
  private difficulty: Difficulty;
  /**
   * Where purchases go. The demo gateway grants without charging, which is all the web
   * build can do; the Capacitor build swaps in RevenueCat behind the same interface.
   */
  private purchases: PurchaseGateway = new DemoGateway();
  /** The challenge being played, if this match is one. */
  private challenge: { index: number; done: boolean; daily: boolean } | null = null;

  private choices: Choices;
  private profile: ProfileStore;
  /**
   * The guided tour, shared with the match screen so there is only ever one overlay: the
   * meta walk hands straight over to the in-match one.
   */
  private tour: Tour;

  constructor(private host: HTMLElement, profile = new ProfileStore()) {
    this.host.replaceChildren();
    this.profile = profile;
    this.tour = new Tour(host);
    // Reopen on the player's last setup, so a rematch is two taps.
    const saved = profile.get();
    this.choices = {
      map: saved.lastMap,
      species: saved.lastSpecies,
      shape: (saved.lastShape in START_SHAPES ? saved.lastShape : "wedge") as ShapeId,
    };
    this.difficulty = saved.difficulty;
    // The faction colour is deliberately NOT set here. Like the legacy build, the home and
    // map screens paint in the stylesheet's default palette; the species picker is what
    // recolours the UI, and it does so on entry.
  }

  start(): void {
    this.show("home");
    // First run only. `tourSeen` is written when the walk finishes OR is skipped, so a
    // player who knows the game sees it once and never again.
    if (this.profile.get().tourSeen < TOUR_VERSION) this.startTour();
  }

  /* ----------------------------------------------------------------------- TOUR */

  /**
   * The walk through the meta screens, ending on the button that starts a match — the
   * match screen picks the tour up from there (see `startMatch`).
   *
   * Every target is looked up by id or class at the moment it is needed, not captured:
   * `show()` REBUILDS a screen on entry, so an element grabbed when the step list was
   * written is a detached node by the time the step opens.
   */
  private startTour(): void {
    this.show("home");
    const steps = this.metaSteps();
    this.tour.start(steps, {
      // One tutorial, counted straight through into the match (see MatchScreen.TOUR_STEPS).
      done: 0,
      total: steps.length + MatchScreen.TOUR_STEPS,
      // Skipping is a decision about the whole tutorial, not this screen: it is not shown
      // again. Finishing the meta walk is NOT the end — the match tour still has to run.
      onSkip: () => this.tutorialSeen(),
    });
  }

  private tutorialSeen(): void {
    this.profile.update((p) => { p.tourSeen = TOUR_VERSION; });
  }

  private metaSteps(): TourStep[] {
    const find = (sel: string) => () => document.querySelector(sel);
    /** A screen on the deck, shown whole and made inert while it is being explained. */
    const deckStep = (
      id: DeckId, inner: string, title: string, text: string,
    ): TourStep => ({
      id,
      title,
      text,
      enter: () => this.slideTo(id, this.deckShowing),
      find: find(`.slide[data-slide="${id}"] ${inner}`),
      // The bar is raised with it: the tab for the screen being explained is already lit,
      // and a lit tab nobody can see teaches nothing about where they are.
      lift: () => document.getElementById("mainNav"),
      block: true,
      pad: 4,
    });

    return [
      {
        id: "welcome",
        title: "Welcome to the colony",
        text: "Two ant colonies fight for one grid, and a queen infected with a real "
          + "parasitic fungus sleeps in the middle. Let me show you around.",
        button: "Show me",
        enter: () => this.slideTo("home", false),
      },
      {
        id: "currency",
        title: "Your three currencies",
        text: "Mycelium buys chambers and new colonies. Pheromone pays for research. "
          + "Trophies are what you win and lose with each match. You start with none — "
          + "every one of them is earned on the board.",
        find: find(".tn-cur"),
      },
      {
        id: "road",
        title: "Trophy Road",
        text: "Every win pushes this bar along. Reach a marker and the reward is yours "
          + "to claim.",
        find: find(".troadbar"),
      },
      {
        id: "nav",
        title: "Five screens, one deck",
        text: "Tap a tab to move between them — or just swipe left and right. Home is in "
          + "the middle, so everything is one swipe away.",
        find: find("#mainNav"),
        pad: 2,
      },
      deckStep("shop", ".shopwrap", "The Shop",
        "Mycelium and pheromone in bulk, the Trophy Pass, and the premium colony. "
        + "Nothing here is needed to win — it is a shortcut, not a wall."),
      deckStep("anthill", ".hillwrap", "The Anthill",
        "Chambers upgrade your whole colony: more income, tougher soldiers, a longer "
        + "reach. This is where mycelium goes first."),
      deckStep("antarium", ".antscroll", "The Antarium",
        "Nine real ant species, each with a real behaviour as its ability. Unlock them "
        + "here, and spend pheromone on research for the one you field."),
      deckStep("challenges", ".challist", "Challenges",
        "Set matches with a twist and a fixed objective, plus a fresh one every day."),
      {
        id: "play",
        title: "Into a match",
        text: "That is the colony. Tap PLAY and let's take some ground.",
        enter: () => this.slideTo("home", true),
        find: find("#goPlay"),
        // A SIGNAL, not a tap. Advancing on the tap itself marched the tour on to "pick a
        // board" whether or not the button had actually opened one — and when it had not,
        // the tutorial sat there asking for a screen that was never coming, with nothing
        // but Skip. The router says when the setup flow really opened.
        advance: "signal",
      },
      // One step per setup screen, lighting the WHOLE box. Lighting only the Next button
      // asked the player to "pick the one you want" with the picker itself in the dark;
      // these advance when the screen actually changes, not on the first tap inside.
      {
        id: "map",
        title: "The board",
        text: "Bigger boards mean longer matches and a Hive that wakes later. Skirmish is "
          + "the quickest. Pick one, then tap Next.",
        find: find("#mapsel .setupbox"),
        advance: "signal",
        pad: 4,
        // A whole picker has no room beside it, so the bubble settles in the MIDDLE — on
        // top of the very cards the step is asking the player to choose between. Pinned to
        // the top it covers the screen's own heading, which the step is already saying.
        bubble: "top",
      },
      {
        id: "species",
        title: "Your colony",
        text: "Leafcutters farm fungus, fire ants sting in a swarm, carpenters tunnel. The "
          + "ability is the species. Choose one, then tap Next.",
        find: find("#start .setupbox"),
        advance: "signal",
        pad: 4,
        bubble: "top",
      },
      {
        id: "shape",
        title: "Your opening",
        text: "Where your first five tiles sit in the corner. A wedge pushes out, a wall "
          + "holds ground. Pick one and begin — I will walk you through the first turn.",
        find: find("#formation .setupbox"),
        advance: "signal",
        pad: 4,
        bubble: "top",
      },
    ];
  }

  /* --------------------------------------------------------------------- ROUTER */

  private show(id: ScreenId): void {
    // The setup steps end when the player LEAVES the screen they are about, so the whole
    // screen can stay live under the tour rather than only its Next button.
    if (this.tour.running) {
      if (id === "mapsel") this.tour.signal("play");
      else if (id === "start") this.tour.signal("map");
      else if (id === "formation") this.tour.signal("species");
    }
    this.clearMatch();
    this.clearOverlay();
    this.closeMenu();
    this.syncNav(id);

    // The five tabs are not five screens the router swaps between — they are one deck the
    // player scrolls through, with the bar underneath standing still. Everything else is a
    // page ON TOP of that deck: the setup flow, the drawer's screens, the species page.
    if (isDeck(id)) {
      this.hideOverlayScreens();
      this.slideTo(id, this.deckShowing);
      return;
    }

    if (this.deck) this.deck.hidden = true;
    for (const [key, el] of this.screens) el.classList.toggle("hidden", key !== id);
    if (!this.screens.has(id)) {
      const el = this.build(id);
      this.screens.set(id, el);
      this.host.appendChild(el);
    } else {
      // Rebuild on entry: the pickers reflect current choices and faction colours.
      const fresh = this.build(id);
      this.screens.get(id)?.replaceWith(fresh);
      this.screens.set(id, fresh);
    }
    for (const [key, el] of this.screens) el.classList.toggle("hidden", key !== id);
  }

  /* ---------------------------------------------------------------------- DECK */

  /** True while the deck is the thing on screen, so a tab change can animate. */
  private get deckShowing(): boolean {
    return this.deck !== null && !this.deck.hidden;
  }

  private hideOverlayScreens(): void {
    for (const [, el] of this.screens) el.classList.add("hidden");
  }

  /**
   * Bring one of the five up. The deck owns the movement; the app only says which screen
   * and whether it should be a movement at all — arriving from the setup flow or a match
   * should not slide the whole colony past the player.
   */
  private slideTo(id: DeckId, smooth: boolean): void {
    const deck = this.deck ?? this.buildDeck();
    deck.hidden = false;
    // The bar marks where the deck is going, not where the router thinks it is: a slide
    // driven from anywhere — a tab, a swipe, the tour — lights the same tab.
    this.syncNav(id);
    deck.goTo(id, smooth);
  }

  private buildDeck(): Deck<DeckId> {
    const deck = new Deck<DeckId>(DECK, (id) => this.build(id), (id) => {
      // However the deck arrived — a tab, a swipe — the bar follows it.
      this.syncNav(id);
    });
    this.host.appendChild(deck.el);
    this.deck = deck;
    return deck;
  }

  /**
   * The bottom nav is one element that outlives every screen, exactly as in the legacy
   * build: it is fixed to the viewport, hidden on the setup flow and during a match, and
   * marks the tab the player is on.
   */
  private syncNav(id: ScreenId | null): void {
    if (!this.nav) {
      this.nav = bottomNav((tab) => this.onNav(tab));
      this.host.appendChild(this.nav);
    }
    const visible = id !== null && NAV_SCREENS.includes(id);
    this.nav.classList.toggle("hidden", !visible);
    for (const b of Array.from(this.nav.querySelectorAll<HTMLElement>(".navitem"))) {
      b.classList.toggle("active", b.dataset.nav === id);
    }
  }

  /** The slide-in drawer behind the hamburger. One element, reused. */
  private openMenu(): void {
    if (!this.menu) {
      this.menu = buildMenu(
        (id) => { this.closeMenu(); this.show(id as ScreenId); },
        () => this.closeMenu(),
      );
      this.host.appendChild(this.menu);
    }
    this.menu.classList.remove("hidden");
  }

  private closeMenu(): void {
    this.menu?.classList.add("hidden");
  }

  /** Start a challenge: a preset match, plus the objective to judge it by. */
  private startChallenge(index: number, daily = false): void {
    const c = CHALLENGES[index];
    if (!c) return;
    this.choices.map = c.map;
    this.choices.species = c.species;
    this.choices.shape = c.shape;
    this.challenge = { index, done: false, daily };
    this.startMatch();
  }

  private onNav(tab: NavId): void {
    // Tapping a tab is the same movement as swiping to it, so it animates.
    if (isDeck(tab)) {
      this.clearOverlay();
      this.closeMenu();
      this.hideOverlayScreens();
      this.syncNav(tab);
      this.slideTo(tab, this.deckShowing);
      return;
    }
    this.show(tab);
  }

  private build(id: ScreenId): HTMLElement {
    if (id === "home") return this.buildHome();
    if (id === "mapsel") return this.buildMapSelect();
    if (id === "start") {
      // Every new play opens on the first colony by rarity, exactly as the legacy build
      // does — the picker is a fresh choice each time, not a memory of the last match.
      this.choices.species = DEFAULT_SPECIES;
      setFactionColor("you", this.choices.species);
      return this.buildSpeciesSelect();
    }
    if (id === "formation") return this.buildFormationSelect();
    if (id === "anthill") return buildAnthill(this.profile);
    if (id === "achievements") return buildTrophyRoad(this.profile, () => this.show("home"), () => this.show("shop"));
    if (id === "quests") return buildQuests(this.profile, () => this.show("profile"));
    if (id === "profile") {
      return buildProfile(this.profile, {
        onBack: () => this.show("home"),
        // `show`, not `slideTo`: the profile is a page ON TOP of the deck, and only the
        // router puts it away again before the deck comes up.
        onColonies: () => this.show("antarium"),
        onChambers: () => this.show("anthill"),
        onQuests: () => this.show("quests"),
      });
    }
    if (id === "rules") return buildRules();
    if (id === "shop") return buildShop(this.profile, this.purchases, () => this.show("home"));
    if (id === "leaderboard") {
      return buildLeaderboard(this.profile.get().trophies, () => this.show("home"));
    }
    if (id === "challenges") return buildChallenges((i) => this.startChallenge(i));
    if (id === "daily") return buildDaily((i) => this.startChallenge(i, true), () => this.show("home"));
    if (id === "news") return buildComingSoon("news", "News", "Latest updates", "📰", () => this.show("home"));
    if (id === "friends") {
      return buildComingSoon("friends", "Friends", "Your colony allies", "👥", () => this.show("home"));
    }
    if (id === "support") {
      return buildComingSoon("support", "Support", "Help & contact", "🛟", () => this.show("home"));
    }
    if (id === "settings") {
      return buildSettings({
        onBack: () => this.show("home"),
        board: MAP_LABEL[this.choices.map],
        difficulty: DIFFICULTY_LABEL[this.difficulty],
        onCycleBoard: () => {
          const next = MAP_ORDER[(MAP_ORDER.indexOf(this.choices.map) + 1) % MAP_ORDER.length];
          this.choices.map = next as MapId;
          this.profile.update((p) => { p.lastMap = this.choices.map; });
          this.show("settings");
        },
        onCycleDifficulty: () => {
          const order: Difficulty[] = ["easy", "normal", "hard"];
          this.difficulty = order[(order.indexOf(this.difficulty) + 1) % order.length] as Difficulty;
          this.profile.update((p) => { p.difficulty = this.difficulty; });
          this.show("settings");
        },
        onReplayTutorial: () => {
          this.profile.update((p) => { p.tourSeen = 0; });
          this.startTour();
        },
      });
    }
    if (id === "antup") {
      return buildSpeciesPage(this.profile, {
        species: this.speciesPage,
        onBack: () => this.show("antarium"),
      });
    }
    return buildAntarium(this.profile, {
      // Opening a colony's page also makes it the one the setup flow will offer first,
      // which is what the legacy build does when you tap into a species.
      onOpenSpecies: (species) => {
        this.speciesPage = species;
        this.choices.species = species;
        setFactionColor("you", species);
        this.profile.update((p) => { p.lastSpecies = species; });
        this.show("antup");
      },
    });
  }

  /**
   * A full-screen panel carrying the legacy build's id. The stylesheet is that build's,
   * verbatim, and several of its rules are keyed by id (#home's artwork, the bottom-nav
   * padding shared by #antarium/#anthill/...), so the id is styling, not a label.
   */
  private screen(id: string): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "screen";
    el.id = id;
    return el;
  }

  private header(
    parent: HTMLElement, title: string, sub?: string,
    back?: () => void, backId?: string,
  ): void {
    const top = document.createElement("div");
    top.className = "screentop";
    if (back) {
      const b = document.createElement("button");
      b.className = "backbtn";
      b.setAttribute("aria-label", "Back");
      b.appendChild(icon("back", 20));
      if (backId) b.id = backId;
      b.onclick = back;
      top.appendChild(b);
    }
    const h = document.createElement("div");
    h.className = "screenh";
    h.textContent = title;
    top.appendChild(h);
    if (sub) {
      const s = document.createElement("div");
      s.className = "screensub";
      s.textContent = sub;
      top.appendChild(s);
    }
    parent.appendChild(top);
  }

  /* ----------------------------------------------------------------------- HOME */

  private buildHome(): HTMLElement {
    const root = this.screen("home");

    root.appendChild(topBar(this.profile.get(), {
      onProfile: () => this.show("profile"),
      onTrophyRoad: () => this.show("achievements"),
      onShop: () => this.show("shop"),
    }));

    // Two floating buttons down the right edge. The legacy build sizes and stacks them
    // against the top bar at runtime; syncFabs does the same measurement.
    const settings = el("button", "settingsfab");
    settings.title = "Menu";
    settings.setAttribute("aria-label", "Menu");
    // `currentColor`, not a fixed white: the button's face is a light one now, and a
    // hardcoded white icon on it is an invisible button.
    settings.appendChild(icon("menu", 19));
    settings.onclick = () => this.openMenu();

    const daily = el("button", "dailyfab");
    daily.title = "Daily challenges";
    daily.append(icon("calendar", 17), el("small", undefined, "Daily"));
    daily.onclick = () => this.show("daily");
    root.append(settings, daily);

    const play = el("div", "homeplay");
    // The app had no name on its own front page. The artwork is the title screen; this is
    // the title.
    const mark = el("div", "homemark");
    mark.append(el("b", undefined, "ZOMBIE"), el("span", undefined, "ANTS"));
    play.appendChild(mark);
    play.appendChild(el("div", "hometag", "Spread · Surround · Consume"));

    const btn = el("button", "playbtn", "PLAY");
    btn.id = "goPlay";
    btn.onclick = () => this.show("mapsel");
    play.appendChild(btn);

    const how = el("button", "howtolink");
    how.append(icon("book", 15), el("span", undefined, "How to play"));
    how.id = "howToBtn";
    how.onclick = () => this.show("rules");
    play.appendChild(how);

    root.appendChild(play);
    requestAnimationFrame(() => syncFabs(root));
    return root;
  }

  /* ----------------------------------------------------------------- MAP SELECT */

  private buildMapSelect(): HTMLElement {
    const el = this.screen("mapsel");
    this.header(el, "Choose your map", undefined, () => this.show("home"), "mapBack");
    el.appendChild(setupSteps(0));

    const body = document.createElement("div");
    body.className = "screenbody";
    const box = document.createElement("div");
    box.className = "setupbox";
    const grid = document.createElement("div");
    grid.className = "mappick";
    grid.id = "mapPick";

    for (const id of MAP_ORDER) {
      const def = MAPS[id];
      const card = document.createElement("div");
      card.className = "mp" + (id === this.choices.map ? " on" : "");
      card.appendChild(mapThumb(def.size));
      const words = document.createElement("div");
      words.className = "mpwords";
      const nm = document.createElement("div");
      nm.className = "snm";
      nm.textContent = def.name;
      // The card said only how big the board is. What a player actually chooses between is
      // how long the match runs and when the Hive wakes up in it.
      const meta = document.createElement("div");
      meta.className = "mpmeta";
      meta.textContent = `Hive wakes turn ${def.awakenTurn} · about ${def.turnLimit} turns`;
      words.append(nm, meta);
      card.appendChild(words);
      card.onclick = () => {
        grid.querySelectorAll(".mp").forEach((x) => x.classList.remove("on"));
        card.classList.add("on");
        this.choices.map = id;
      };
      grid.appendChild(card);
    }

    const next = document.createElement("button");
    next.className = "cta";
    next.id = "mapNext";
    next.textContent = "Next →";
    next.onclick = () => this.show("start");

    box.append(grid, next);
    body.appendChild(box);
    el.appendChild(body);
    return el;
  }

  /* ------------------------------------------------------------- SPECIES SELECT */

  private buildSpeciesSelect(): HTMLElement {
    const root = this.screen("start");
    this.header(root, "Choose your species", undefined, () => this.show("mapsel"), "specBack");
    root.appendChild(setupSteps(1));

    const body = document.createElement("div");
    body.className = "screenbody";
    const box = document.createElement("div");
    box.className = "setupbox";
    const slider = document.createElement("div");
    slider.className = "pickslider";
    slider.id = "pick";

    let selectedCard: HTMLElement | null = null;

    for (const id of SPECIES_ORDER) {
      const s = SPECIES[id];
      const pal = SPECIES_COL[id];
      // Locked colonies stay on the slider so the player can read what they are working
      // toward — they just cannot be fielded until the Antarium sells them.
      const owned = this.profile.isUnlocked(id);
      const card = document.createElement("div");
      const chosen = id === this.choices.species;
      card.className = "sp" + (chosen ? " on" : "") + (owned ? "" : " splock");

      const face = document.createElement("div");
      face.className = "face";
      const fc = document.createElement("canvas");
      fc.width = 96; fc.height = 96;
      const fx = fc.getContext("2d");
      if (fx) antHead(fx, 48, 48, 44, pal, basicLook(id));
      face.appendChild(fc);

      const nm = document.createElement("div");
      nm.className = "nm";
      nm.style.color = pal[1];
      nm.textContent = s.name;
      if (s.premium) {
        const prem = document.createElement("span");
        prem.className = "prem";
        prem.textContent = "PREMIUM";
        nm.appendChild(prem);
      }

      const mods = document.createElement("div");
      mods.className = "mods";
      mods.textContent = `⚔ ${s.atk.toFixed(1)} · 🛡 ${s.def.toFixed(1)}`;

      const ds = document.createElement("div");
      ds.className = "ds";
      ds.textContent = s.blurb;

      const tr = document.createElement("div");
      tr.className = "tr";
      tr.style.color = pal[1];
      tr.textContent = s.trait;

      card.append(face, nm, mods, ds, tr);
      if (!owned) {
        const lock = document.createElement("div");
        lock.className = "splockmsg";
        lock.textContent = "🔒 Unlock in the Antarium";
        card.appendChild(lock);
      }

      const highlight = (on: boolean): void => {
        card.classList.toggle("on", on);
        card.style.borderColor = on ? pal[0] : "";
        card.style.boxShadow = on ? `0 0 0 1px ${pal[0]} inset, 0 0 22px ${hexA(pal[1], 0.30)}` : "";
      };
      if (chosen) { highlight(true); selectedCard = card; }

      card.onclick = () => {
        if (!owned) {
          toast(root, `${s.name} is locked — unlock it in the Antarium.`, "bad");
          return;
        }
        slider.querySelectorAll(".sp").forEach((x) => {
          x.classList.remove("on");
          (x as HTMLElement).style.borderColor = "";
          (x as HTMLElement).style.boxShadow = "";
        });
        highlight(true);
        this.choices.species = id;
        setFactionColor("you", id);          // the whole UI takes the species' colours
        card.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      };
      slider.appendChild(card);
    }

    const next = document.createElement("button");
    next.className = "cta";
    next.id = "toFormation";
    next.textContent = "Next →";
    next.onclick = () => this.show("formation");

    box.append(slider, next);
    body.appendChild(box);
    root.appendChild(body);

    // open on the species already fielded
    // Guarded: jsdom has no scrollIntoView, and a screen must survive a DOM that is
    // missing a convenience exactly as it survives a canvas with no context.
    requestAnimationFrame(() => selectedCard?.scrollIntoView?.({ inline: "center", block: "nearest" }));
    return root;
  }

  /* ----------------------------------------------------------- FORMATION SELECT */

  private buildFormationSelect(): HTMLElement {
    const el = this.screen("formation");
    this.header(el, "Choose your formation", undefined, () => this.show("start"), "formBack");
    el.appendChild(setupSteps(2));

    const body = document.createElement("div");
    body.className = "screenbody";
    const box = document.createElement("div");
    box.className = "setupbox";
    const grid = document.createElement("div");
    grid.className = "shapepick";
    grid.id = "shapePick";

    // The legacy picker always opens on the first formation rather than the saved one.
    const first = (Object.keys(START_SHAPES) as ShapeId[])[0] as ShapeId;
    this.choices.shape = first;
    for (const id of Object.keys(START_SHAPES) as ShapeId[]) {
      const cellWrap = document.createElement("div");
      cellWrap.className = "shpcell";
      const card = document.createElement("div");
      card.className = "shp" + (id === first ? " on" : "");
      card.appendChild(shapeThumb(START_SHAPES[id]));
      const nm = document.createElement("div");
      nm.className = "snm";
      nm.textContent = id.charAt(0).toUpperCase() + id.slice(1);
      card.onclick = () => {
        grid.querySelectorAll(".shp").forEach((x) => x.classList.remove("on"));
        card.classList.add("on");
        this.choices.shape = id;
      };
      cellWrap.append(card, nm);
      grid.appendChild(cellWrap);
    }

    const begin = document.createElement("button");
    begin.className = "cta";
    begin.id = "begin";
    begin.textContent = "Begin the spread →";
    begin.onclick = () => { this.challenge = null; this.startMatch(); };

    box.append(grid, begin);
    body.appendChild(box);
    el.appendChild(body);
    return el;
  }

  /* ---------------------------------------------------------------------- MATCH */

  private startMatch(): void {
    if (this.tour.running) this.tour.signal("shape");
    // Whether this match is the tutorial one, decided once: the board is arranged for it
    // and the match screen runs the walkthrough on it.
    const tutorial = this.profile.get().tourSeen < TOUR_VERSION;
    // "Play again" comes straight back here, so tear the old match down first — otherwise
    // its render loop and timers keep running behind the new one.
    this.clearMatch();
    this.syncNav(null);          // the nav is hidden during a match
    const aiSpecies = rollAISpecies(this.choices.species);
    setFactionColor("you", this.choices.species);
    setFactionColor("ai", aiSpecies);

    // Anthill and research come from the profile; the AI always gets the neutral set.
    const mods = this.profile.modsFor(this.choices.species);
    // Counted as the match runs: by the time it ends the surge may have lapsed and the
    // hive handed its tiles back, so the board can no longer say it happened.
    let queensTaken = 0;

    const state = createGame({
      map: this.choices.map,
      species: { you: this.choices.species, ai: aiSpecies },
      shape: START_SHAPES[this.choices.shape],
      // The enemy picks its own formation, so the board never opens as a perfect mirror of
      // your own corner. Both sides still get exactly five tiles and identical income.
      aiShape: START_SHAPES[rollShape()],
      mods,
      seed: (Date.now() ^ (Math.random() * 0xffffffff)) | 0,
    });

    // A first match played straight cannot teach the game: the Hive sleeps for ten turns
    // and five tiles of three soldiers cannot crack anything. The tutorial is played on an
    // arranged board where every lesson is available on turn one.
    if (tutorial) arrangeTutorial(state);

    this.profile.update((p) => {
      p.lastMap = this.choices.map;
      p.lastSpecies = this.choices.species;
      p.lastShape = this.choices.shape;
    });

    for (const el of this.screens.values()) el.classList.add("hidden");

    this.match = new MatchScreen(this.host, {
      state,
      mods,
      // The same mods must drive combat, or Mandible/Cuticle research would show up in the
      // income readout but do nothing in a fight.
      ctx: { mods },
      // A FIRST MATCH IS PLAYED ON EASY, whatever the setting says. The walkthrough hands
      // the turn over four times and the enemy answers each one from a script; the moment
      // it ends the real opponent takes over, and the first one a new player meets should
      // not be the one that beats `normal` 96% of the time.
      difficulty: tutorial ? "easy" : this.difficulty,
      map: this.choices.map,
      // The meta walk ends on the button that got us here, so the match picks the tutorial
      // up and finishes it. A player who skipped has `tourSeen` written already.
      tutorial,
      tour: this.tour,
      tourFrom: this.metaSteps().length,
      onTutorialDone: () => this.tutorialSeen(),
      onAbilityCast: (kind) => {
        this.profile.update((p) => {
          p.stats.abilities++;
          if (kind === "tunnel") p.stats.tunnels++;
        });
        this.profile.questProgress("ability");
      },
      onEvents: (events) => {
        scoreQuestEvents(this.profile, events);
        // The Hive is taken during a match, not at the end of one, so it has to be counted
        // as it happens — by the time the card is up the surge may already have lapsed.
        queensTaken += events.filter(
          (e) => e.type === "hiveCaptured" && e.owner === "you").length;
      },
      // "Strike the enemy before they strike you" is settled by the first attack of the
      // match, whoever lands it. Every other objective is decided the ordinary way.
      judge: (events) => {
        const goal = this.challenge ? CHALLENGES[this.challenge.index]?.goal : undefined;
        if (goal !== "attackFirst") return null;
        const attack = events.find((e) => e.type === "combat");
        return attack && attack.type === "combat" ? attack.attacker : null;
      },
      onExit: (winner, reason, played) => {
        // Snapshot before recording, so the card can report what this match actually paid.
        const before = this.profile.get();
        const beforeXp = before.xp;
        const beforeTrophies = before.trophies;
        const beforeMycel = before.mycel;
        const beforeLevel = this.profile.level().level;
        this.profile.recordResult(winner === "you", this.choices.species, state.turn, {
          playedMs: played,
          queens: queensTaken,
          byNest: reason === "nest",
        });
        this.profile.questProgress("play");
        if (winner === "you") this.profile.questProgress("win");
        // A challenge pays on top of the usual match reward, once.
        if (this.challenge && !this.challenge.done) {
          this.challenge.done = true;
          const daily = this.challenge.daily;
          if (winner === "you") {
            this.profile.update((p) => {
              p.mycel += CHALLENGE_REWARD;
              if (daily) p.pheromone += DAILY_BONUS_PHEROMONE;
            });
          }
        }
        const after = this.profile.get();
        const level = this.profile.level().level;
        this.showResult(winner, {
          challenge: this.challenge ? CHALLENGES[this.challenge.index] ?? null : null,
          turns: state.turn,
          played,
          youArmy: armyOf(state, "you"),
          species: this.choices.species,
          xpGained: after.xp - beforeXp,
          trophies: after.trophies,
          trophyDelta: after.trophies - beforeTrophies,
          mycel: after.mycel - beforeMycel,
          leveledTo: level > beforeLevel ? level : null,
          reason,
        });
      },
    });
    this.match.start();
  }

  private clearMatch(): void {
    this.match?.destroy();
    this.match = null;
  }

  /* --------------------------------------------------------------------- RESULT */

  /**
   * The result card.
   *
   * Three blocks, in the order the player cares about them: what happened, what it PAID,
   * and what the match looked like. The rewards came first only after the card was seen on
   * a phone — the old one led with four cramped facts and mentioned XP last, while the two
   * numbers that actually move the player forward, trophies and mycelium, were not on it
   * at all.
   */
  private showResult(winner: Player | null, recap: {
    turns: number; played: number; youArmy: number; species: SpeciesId;
    xpGained: number; trophies: number; trophyDelta: number; mycel: number;
    leveledTo: number | null; reason: GameOverReason | null;
    challenge: Challenge | null;
  }): void {
    const won = winner === "you";
    const ov = el("div", "overlay");
    ov.id = "over";
    const wrap = el("div", "overModalWrap");

    const card = el("div", "card result " + (won ? "win" : "lose"));
    card.id = "overCard";

    const h1 = el("h1", undefined,
      recap.challenge ? (won ? "Challenge complete!" : "Challenge failed.") : (won ? "Victory" : "Defeat"));
    h1.id = "overTitle";
    const tag = el("div", "tag", recap.challenge
      ? `${recap.challenge.name} — ${GOAL_TEXT[recap.challenge.goal]}  ${won ? "✓" : "✗"}`
      : resultFlavour(won, recap.reason, recap.turns));
    tag.id = "overSub";
    card.append(h1, tag);

    // WHAT IT PAID. Three cells, equal width, each one a currency the player recognises
    // from the top bar — the same marks, so the card reads as the bar being fed.
    const rewards = el("div", "payouts");
    rewards.id = "overRewards";
    const reward = (mark: string, value: string, note: string, kind: string): HTMLElement => {
      const cell = el("div", `payout pay-${kind}`);
      const head = el("div", "payv");
      head.append(icon(mark, 17), el("b", undefined, value));
      cell.append(head, el("small", undefined, note));
      return cell;
    };
    rewards.append(
      reward("trophy", signed(recap.trophyDelta), `${recap.trophies} total`, "trophy"),
      reward("mycel", signed(recap.mycel), "mycelium", "mycel"),
      reward("star", `+${recap.xpGained}`, "colony XP", "xp"),
    );
    card.appendChild(rewards);

    // A level-up is the one thing worth its own line — it is why the XP cell matters.
    if (recap.leveledTo !== null) {
      const banner = el("div", "levelup");
      banner.append(icon("star", 16), el("b", undefined, `Colony level ${recap.leveledTo}`));
      card.appendChild(banner);
    }

    // WHAT THE MATCH LOOKED LIKE. Quieter, and on a grid: four facts in a row across a
    // phone gave four different column widths and a fifth cell stranded underneath.
    const facts = el("div", "facts");
    facts.id = "overRecap";
    const fact = (k: string, v: string | number): HTMLElement => {
      const d = el("div", "fact");
      d.append(el("span", "fk", k), el("span", "fv", String(v)));
      return d;
    };
    facts.append(
      fact("Turns", recap.turns),
      fact("Colony", SPECIES[recap.species].name.split(" ")[0] ?? ""),
      fact("Your army", recap.youArmy),
      // NOT the enemy's army. By the time this card is up their colony has been overrun —
      // the finale has just washed the whole board in one colour — so a number for what
      // they had is a number for something that is not there. How long it took is the fact
      // the player does not otherwise have.
      fact("Time", clockOf(recap.played)),
    );
    card.appendChild(facts);

    const acts = el("div", "resultacts");
    const again = el("button", "cta begin", "Play again");
    again.id = "again";
    again.onclick = () => { this.clearOverlay(); this.startMatch(); };

    const minor = el("div", "resultminor");
    const reSpecies = el("button", "ghostbtn", "Change colony");
    reSpecies.id = "reSpecies";
    reSpecies.onclick = () => { this.clearOverlay(); this.show("start"); };

    const home = el("button", "ghostbtn", "Home");
    home.id = "overHome";
    home.onclick = () => { this.clearOverlay(); this.show("home"); };

    minor.append(reSpecies, home);
    acts.append(again, minor);
    card.appendChild(acts);

    wrap.appendChild(card);
    ov.appendChild(wrap);
    this.host.appendChild(ov);
    this.overlay = ov;
  }

  private clearOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

}

/**
 * Size the two floating buttons and stack them under the top bar.
 *
 * They are `position:absolute` with a percentage top in the stylesheet; the legacy build
 * measures the daily button and pins both to the bar's bottom edge so they never collide
 * with it on a short screen. A zero-sized measurement means the screen is not laid out
 * yet — skip rather than pin them to 0 (CLAUDE.md §5).
 */
/** A delta the way a scoreboard writes one: the sign is part of the number. */
const signed = (n: number): string => (n >= 0 ? `+${n}` : String(n));

function syncFabs(home: HTMLElement): void {
  const daily = home.querySelector<HTMLElement>(".dailyfab");
  const settings = home.querySelector<HTMLElement>(".settingsfab");
  const head = home.querySelector<HTMLElement>(".tophead");
  if (!daily || !settings) return;
  const box = daily.getBoundingClientRect();
  if (!box.width || !box.height) return;

  settings.style.width = `${box.width}px`;
  settings.style.height = `${box.height}px`;
  const top = home.getBoundingClientRect().top;
  const y = head ? head.getBoundingClientRect().bottom - top + 10 : 84;
  settings.style.top = `${y}px`;
  daily.style.top = `${y + box.height + 10}px`;
}

/**
 * The line under the result title. The legacy build words each ending differently, and the
 * wording is the only place the *reason* a match ended is ever stated.
 */
function resultFlavour(won: boolean, reason: GameOverReason | null, turns: number): string {
  if (reason === "surrender") {
    return `You surrendered on turn ${turns}. The hollow falls silent.`;
  }
  return won
    ? `Enemy nest captured on turn ${turns}. The fungus spreads.`
    : `The enemy reached your queen on turn ${turns}.`;
}

/* ----------------------------------------------------------------------- THUMBS */

const cssVar = (n: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/** Board thumbnail: a checkerboard with each colony's starting corner marked. */
function mapThumb(n: number): HTMLCanvasElement {
  const SZ = 58;
  const cv = document.createElement("canvas");
  cv.width = SZ; cv.height = SZ;
  const g = cv.getContext("2d");
  if (!g) return cv;
  const cell = SZ / n;

  g.fillStyle = "rgba(255,255,255,.04)";
  g.fillRect(0, 0, SZ, SZ);
  g.fillStyle = cssVar("--line");
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if ((r + c) % 2 === 0) { g.globalAlpha = 0.6; g.fillRect(c * cell, r * cell, cell, cell); }
    }
  }
  g.globalAlpha = 1;

  // Gauntlet's two water bites, so the thumbnail shows why that map plays differently.
  if (n === 13) {
    g.fillStyle = "#2f6fb0";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const left = c * c + (r - 6) * (r - 6);
        const right = (c - (n - 1)) * (c - (n - 1)) + (r - 6) * (r - 6);
        if (left <= 9 || right <= 9) g.fillRect(c * cell, r * cell, cell, cell);
      }
    }
  }

  const b = Math.max(cell * 2, 8);
  g.fillStyle = cssVar("--you-glow"); g.fillRect(0, SZ - b, b, b);        // your corner
  g.fillStyle = cssVar("--ai-glow"); g.fillRect(SZ - b, 0, b, b);         // enemy corner
  return cv;
}

/** Formation thumbnail, drawn hugging the bottom-left as it sits in the player's corner. */
function shapeThumb(cells: ReadonlyArray<readonly [number, number]>): HTMLCanvasElement {
  const SZ = 72;
  const cv = document.createElement("canvas");
  cv.width = SZ; cv.height = SZ;
  const g = cv.getContext("2d");
  if (!g) return cv;
  const cell = SZ / 5, r = 3;

  cells.forEach(([lc, lr], idx) => {
    const x = lc * cell, y = (SZ - cell) - lr * cell;
    g.fillStyle = idx === 0 ? cssVar("--you-glow") : cssVar("--you");   // cell 0 is the nest
    g.globalAlpha = idx === 0 ? 1 : 0.85;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + cell, y, x + cell, y + cell, r);
    g.arcTo(x + cell, y + cell, x, y + cell, r);
    g.arcTo(x, y + cell, x, y, r);
    g.arcTo(x, y, x + cell, y, r);
    g.closePath(); g.fill();
    g.globalAlpha = 1;
  });
  return cv;
}

/**
 * Turn a batch of engine events into progress: today's quest, and the career total.
 *
 * Both come off the same count, and they are counted HERE rather than at two call sites so
 * one tested function owns the translation — a quest that credits a capture the profile
 * does not is a pair of numbers that disagree with each other on screen.
 *
 * Only the player's own captures count — the AI taking a tile is not progress — and the
 * whole batch is folded into one call so a Spread that claims six tiles does not write six
 * times. Exported so the translation is testable without a running match.
 */
export function scoreQuestEvents(profile: ProfileStore, events: readonly EngineEvent[]): void {
  let captured = 0;
  for (const e of events) if (e.type === "capture" && e.owner === "you") captured++;
  if (!captured) return;
  profile.questProgress("conquered", captured);
  profile.recordCaptures(captured);
}

/** The enemy's formation, chosen at setup time — the engine itself stays free of randomness. */
export function rollShape(rng: () => number = Math.random): ShapeId {
  const keys = Object.keys(START_SHAPES) as ShapeId[];
  return keys[Math.floor(rng() * keys.length)] ?? "wedge";
}

/**
 * The AI fields a species different from yours, weighted toward combat power so it stays a
 * consistent threat — but every non-premium species can still turn up. Setup-time only:
 * the engine itself stays free of randomness (CLAUDE.md §4.1).
 */
export function rollAISpecies(yours: SpeciesId, rng: () => number = Math.random): SpeciesId {
  const pool = (Object.keys(SPECIES) as SpeciesId[])
    .filter((k) => k !== yours && !SPECIES[k].premium);
  if (!pool.length) return yours;
  const weight = (k: SpeciesId): number => 0.5 + SPECIES[k].atk * SPECIES[k].def;
  const total = pool.reduce((s, k) => s + weight(k), 0);
  let roll = rng() * total;
  for (const k of pool) {
    roll -= weight(k);
    if (roll <= 0) return k;
  }
  return pool[pool.length - 1] as SpeciesId;
}
