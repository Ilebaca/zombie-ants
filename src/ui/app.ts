/**
 * App shell: home → map → species → formation → match → result.
 *
 * Meta screens own *choices*; the engine owns rules. Nothing here reaches into a running
 * match — a match is created from the choices, handed to MatchScreen, and reported back
 * through `onExit`.
 */
import { START_SHAPES, armyOf, arrangeTutorial, createGame } from "../engine";
import type { MapId, Player, SpeciesId } from "../engine";
import type { Difficulty } from "../ai/search";
import type { ShapeId } from "../engine";
import {
  DEFAULT_SPECIES, DemoGateway, LocalDuels, LocalFriendService, LocalMatchmaker, LocalSupportGateway,
  ProfileStore, TOUR_VERSION, botsForChapter, chapterOf, compact, makeFeedback,
  scoreQuestEvents,
} from "../platform";
import type {
  DuelInvite, DuelService, Feedback, Friend, FriendService, MatchLog, Matchmaker, Opponent,
  Person, PurchaseGateway, SupportGateway, TraitScope,
} from "../platform";
import { setFactionColor } from "../render";
import { buildAnthill } from "./anthill";
import { buildInventory, buildTraitBench } from "./traits";
import { buildAntarium } from "./antarium";
import { buildSpeciesPage } from "./species";
import { buildProfile } from "./profile";
import { icon } from "./icons";
import {
  NAV_SCREENS, bottomNav, el, granaryPill, screenEl, toast, topBar,
} from "./chrome";
import type { NavId } from "./chrome";
import { MatchScreen } from "./match";
import {
  CHALLENGES, CHALLENGE_REWARD, DAILY_BONUS_PHEROMONE, buildChallenges, buildDaily, dayNumber,
} from "./challenges";
import { buildLeaderboard } from "./leaderboard";
import { buildShop } from "./shop";
import { buildQuests } from "./quests";
import { buildComingSoon, buildMenu } from "./screens-simple";
import { buildNews } from "./news";
import { buildFriends } from "./friends";
import { buildSupport } from "./support";
import { buildSettings } from "./settings";
import { buildRules } from "./rules";
import { buildFormationSelect, buildMapSelect, buildSpeciesSelect, rollAISpecies, rollShape } from "./setup";
import { buildDuelPick, inviteBar } from "./duel";
import { ReplayScreen, buildHistory } from "./history";
import { canReplay } from "../platform";
import type { Choices, SetupOptions } from "./setup";
import { buildResultCard } from "./result";
import { MatchmakingScreen } from "./matchmaking";
import type { Recap } from "./result";
import { buildColonyRoad } from "./road";
import { Deck } from "./deck";
import { Tour } from "./tour";
import { lockPortrait } from "../platform/orientation";
import type { TourStep } from "./tour";
import "./game.css";
import "./skin.css";   // the look, layered over the structure

/**
 * Route ids are the legacy build's screen ids. The stylesheet is that build's, and some of
 * its rules select by id, so these names are load-bearing.
 */
type ScreenId =
  | "home" | "mapsel" | "start" | "formation" | "duelpick" | "history"
  | "anthill" | "antarium" | "antup" | "achievements" | "quests" | "profile"
  | "challenges" | "daily" | "rules" | "settings" | "news" | "friends" | "support"
  | "luckyhatch" | "leaderboard" | "shop" | "traits" | "inventory";

/**
 * Is this press on something that ACTS?
 *
 * The interface sound belongs to controls, not to the screen: a drag across the board, a
 * swipe between deck screens or a scroll down a list must not click. Anything a browser
 * would treat as a button counts, plus the few controls this app draws itself.
 */
function pressable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    'button, a, input, [role="button"], [role="switch"], .navitem, .menuitem, .roadcell',
  );
}

/**
 * The five screens on the deck, in the order the bottom bar lists them. Home sits in the
 * middle, so it is one swipe from everything.
 */
const DECK = ["shop", "anthill", "home", "antarium", "challenges"] as const;
type DeckId = (typeof DECK)[number];
const isDeck = (id: string): id is DeckId => (DECK as readonly string[]).includes(id);

/** Short names for the settings screen, as the legacy build labels them. */
const MAP_LABEL: Record<MapId, string> = { tiny: "Skirmish", small: "Corridor", mid: "Gauntlet" };
/** The three maps, in the order Settings cycles through them. */
const MAP_ORDER: readonly MapId[] = ["tiny", "small", "mid"];
const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

/** Setup choices that survive between matches. */
export class App {
  private screens = new Map<ScreenId, HTMLElement>();
  private match: MatchScreen | null = null;
  private overlay: HTMLElement | null = null;
  private nav: HTMLElement | null = null;
  /** Which colony the #antup page is showing. */
  private speciesPage: SpeciesId = "leafcutter";
  /**
   * Which bench the trait screen is showing, and where Back goes.
   *
   * One screen serves the anthill's five and every colony's five, so the scope has to
   * live out here — and so does the way back, because the same screen is reached from
   * two different places and must not strand the player on the other one.
   */
  private traitScope: TraitScope = "hill";
  private traitBack: ScreenId = "anthill";
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
  /**
   * Who the player is put against. Offline it always ends in a bot, but the seam is the
   * real one: a server-backed finder is a new class here and nothing else moves.
   */
  private matchmaker: Matchmaker = new LocalMatchmaker();
  private matchmaking: MatchmakingScreen | null = null;
  /**
   * The two other offline stand-ins, held the same way the matchmaker is: an interface
   * each, so a server-backed implementation is one line here and nothing else moves.
   */
  private readonly friends: FriendService = new LocalFriendService();
  /**
   * Who answers a challenge. Offline nobody really does, so `LocalDuels` sits the friend
   * down after a moment — the same arrangement `Matchmaker` has, and the same one line to
   * change when there is a server.
   */
  private readonly duels: DuelService = new LocalDuels();
  private readonly support: SupportGateway = new LocalSupportGateway();
  /**
   * Sound and haptics (platform/feedback.ts).
   *
   * One for the whole app, because an audio device is a device: a match screen that made
   * its own would leak one per match. It is created muted-or-not from the save and
   * UNLOCKED on the first press anywhere — a browser refuses to start audio without a
   * gesture, and the first press is the earliest honest one.
   */
  private readonly feedback: Feedback = makeFeedback();
  /** Redraw the home top bar in place. Set when home is built; a no-op before that. */
  private rebuildHomeBar: () => void = () => {};
  /** The challenge being played, if this match is one. */
  private challenge: { index: number; done: boolean; daily: boolean } | null = null;

  /**
   * WHAT KIND OF MATCH THE SETUP FLOW IS SETTING UP.
   *
   * `null` is the ordinary one, which ends in a search for a stranger. A duel ends
   * somewhere else — either at the friend picker (you are the one challenging) or straight
   * at the board with the person who invited you — so the flow has to know before it
   * reaches the end of itself, and only the shell can know.
   */
  private duel: { host: true } | { host: false; invite: DuelInvite } | null = null;

  /**
   * The seed the two players share for a duel.
   *
   * A match is only replayable — and only verifiable by a server — if both sides open the
   * same board (engine/protocol.ts), and ability scatter draws from this. Offline there is
   * nobody to agree with, so `LocalDuels` picks one; with a server it is the server's.
   */
  private duelSeed: number | null = null;

  /** The replay on screen, if one is. Torn down by the router like a match is. */
  private replay: ReplayScreen | null = null;

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
    this.applyFeedbackPrefs();
    /*
     * ONE LISTENER FOR EVERY PRESS IN THE APP.
     *
     * It does two jobs, and both have to happen here rather than on each screen. A browser
     * refuses to start audio without a gesture, so the device is created on the first press
     * anywhere; and every button in the game makes the SAME sound, which is a property of
     * the app rather than of any screen — wiring a click cue into forty controls one at a
     * time is forty chances to miss one, and the two that were missed would be the two a
     * player noticed.
     *
     * Captured, so a handler that stops propagation cannot silence the interface, and on
     * `pointerdown` rather than `click`: the sound belongs to the press, not to the release.
     */
    this.host.addEventListener("pointerdown", (e) => {
      this.feedback.unlock();
      // Asked for on a gesture, like the audio device, and for the same reason: a browser
      // that grants this at all grants it to a user action (platform/orientation.ts).
      lockPortrait();
      if (pressable(e.target)) this.feedback.play("tap");
    }, { capture: true });
    // The menu bed goes on at boot. It cannot actually sound until the first press — the
    // device does not exist yet — and `unlock` picks the wish up from there.
    this.feedback.setMusic("menu");
    this.show("home");
    // First run only. `tourSeen` is written when the walk finishes OR is skipped, so a
    // player who knows the game sees it once and never again.
    if (this.profile.get().tourSeen < TOUR_VERSION) this.startTour();
  }

  /**
   * Take the settings that live on the app object back off the save.
   *
   * The difficulty and the map are held here as well as in the profile, so a save that is
   * swapped underneath — reset, or restored from a backup code — leaves the shell playing
   * by the old one until it is told.
   */
  private adoptProfile(): void {
    this.difficulty = this.profile.get().difficulty;
    this.choices.map = this.profile.get().lastMap;
  }

  /** Push the saved switches into the device. Called at boot and whenever one is flipped. */
  private applyFeedbackPrefs(): void {
    const p = this.profile.get();
    this.feedback.setSound(p.sound);
    this.feedback.setMusicEnabled(p.music);
    this.feedback.setHaptics(p.haptics);
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
        title: "Colony Road",
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
        "Mycelium and pheromone in bulk, the Colony Pass, and the premium colony. "
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
    this.clearReplay();
    // Navigating away abandons a search in flight — the finder is told, so a promise that
    // resolves after the player left cannot start a match behind the screen they went to.
    this.clearMatchmaking();
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

  /** Open a bench, remembering which screen sent us so Back is not a guess. */
  private openTraits(scope: TraitScope, back: ScreenId): void {
    this.traitScope = scope;
    this.traitBack = back;
    this.show("traits");
  }

  /** The slide-in drawer behind the hamburger. One element, reused. */
  private openMenu(): void {
    // REBUILT every time, not reused: the News entry carries how many posts are unread,
    // and a drawer built once would still be advertising them after they had been read.
    this.menu?.remove();
    this.menu = buildMenu(
      (id) => { this.closeMenu(); this.show(id as ScreenId); },
      () => this.closeMenu(),
      this.profile.unread(),
    );
    this.host.appendChild(this.menu);
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
    if (id === "mapsel") {
      // Set BEFORE the picker is built: `buildMapSelect` opens its deck on `choices.map`
      // while it is being constructed, so choosing the ground afterwards moves nothing.
      const invite = this.profile.duels[0];
      if (invite) this.choices.map = invite.map;
      const screen = buildMapSelect(this.setup(() => this.show("home"), "start"));
      // THE INVITATION SITS ON THE SCREEN IT REPLACES. A challenge starts by choosing the
      // ground; an invitation has already chosen it, so the bar goes on top of that
      // choice rather than on a screen of its own.
      if (invite) {
        // THE BOARD BEHIND THE BAR IS THE ONE BEING OFFERED. The bar names their ground,
        // and a picker sitting on the player's own last choice underneath it says two
        // different things about the same match. Opening on theirs makes the screen SHOW
        // the invitation rather than only describe it — and the player can still swipe
        // away, which is what declining and choosing your own looks like.
        screen.classList.add("hasinvite");
        screen.prepend(inviteBar({
          invite,
          onAccept: () => this.acceptDuel(invite.id),
          onDecline: () => { this.profile.answerDuel(invite.id); this.show("mapsel"); },
        }));
      }
      return screen;
    }
    if (id === "start") {
      // Every new play opens on the first colony by rarity, exactly as the legacy build
      // does — the picker is a fresh choice each time, not a memory of the last match.
      this.choices.species = DEFAULT_SPECIES;
      setFactionColor("you", this.choices.species);
      return buildSpeciesSelect(this.setup(() => this.show("mapsel"), "formation"));
    }
    if (id === "formation") {
      return buildFormationSelect(this.setup(() => this.show("start"), "formation"));
    }
    if (id === "duelpick") {
      return buildDuelPick({
        profile: this.profile,
        onBack: () => this.show("formation"),
        onPick: (friend) => this.playDuel(friend),
        onFindFriends: () => this.show("friends"),
      });
    }
    if (id === "anthill") {
      return buildAnthill(this.profile, { onTraits: () => this.openTraits("hill", "anthill") });
    }
    if (id === "inventory") {
      return buildInventory(this.profile, {
        onBack: () => this.show("home"),
        // Straight into the bench a tile belongs to, and Back from there comes here —
        // the inventory is where the player was, not the screen the bench usually sits on.
        onOpen: (scope) => this.openTraits(scope, "inventory"),
      });
    }
    if (id === "traits") {
      return buildTraitBench(this.profile, {
        scope: this.traitScope,
        onBack: () => this.show(this.traitBack),
      });
    }
    if (id === "achievements") return buildColonyRoad(this.profile, () => this.show("home"), () => this.show("shop"));
    if (id === "quests") return buildQuests(this.profile, () => this.show("profile"));
    if (id === "profile") {
      return buildProfile(this.profile, {
        onBack: () => this.show("home"),
        // `show`, not `slideTo`: the profile is a page ON TOP of the deck, and only the
        // router puts it away again before the deck comes up.
        onColonies: () => this.show("antarium"),
        onChambers: () => this.show("anthill"),
        onQuests: () => this.show("quests"),
        onHistory: () => this.show("history"),
        // Straight to the anthill's five: they are the ones that apply whatever colony
        // is fielded, so they are the right first thing to see from a screen about the
        // player rather than about one species.
        onTraits: () => this.openTraits("hill", "profile"),
      });
    }
    if (id === "history") {
      return buildHistory(this.profile, () => this.show("profile"), (log) => this.watch(log));
    }
    if (id === "rules") return buildRules();
    if (id === "shop") return buildShop(this.profile, this.purchases, () => this.show("home"));
    if (id === "leaderboard") {
      const me = this.profile.get();
      return buildLeaderboard(
        { name: me.name, colony: me.colony, species: me.lastSpecies },
        () => this.show("home"),
      );
    }
    if (id === "challenges") return buildChallenges(this.profile, (i) => this.startChallenge(i));
    if (id === "daily") {
      return buildDaily(
        this.profile, (i) => this.startChallenge(i, true),
        () => this.show("home"), () => this.show("challenges"),
      );
    }
    // The one menu entry that really is unbuilt (CLAUDE.md §9: the lucky hatch needs the
    // larva currency and a cosmetics pool, neither of which exists). It fell through to
    // the Antarium, so tapping it silently opened a different screen.
    if (id === "luckyhatch") {
      return buildComingSoon("luckyhatch", "Lucky hatch", "Colony cosmetics", "brood",
        () => this.show("home"));
    }
    if (id === "news") return buildNews(this.profile, () => this.show("home"));
    if (id === "friends") {
      return buildFriends(this.profile, this.friends, () => this.show("home"));
    }
    if (id === "support") {
      return buildSupport(this.profile, this.support, () => this.show("home"));
    }
    if (id === "settings") {
      return buildSettings({
        profile: this.profile,
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
        onHowToPlay: () => this.show("rules"),
        // The switch writes the profile; this is what makes the live device agree with it
        // without waiting for a reload.
        onFeedbackChanged: () => this.applyFeedbackPrefs(),
        onReplayTutorial: () => {
          this.profile.update((p) => { p.tourSeen = 0; });
          this.startTour();
        },
        // Everything erased. The screen asks twice before this is reached, and the app
        // goes home rather than staying on a settings screen describing a colony that no
        // longer exists.
        onReset: () => {
          this.profile.reset();
          this.adoptProfile();
          this.show("home");
        },
        // A restored save is a different colony: the difficulty, the map and the sound
        // switches all came off the code, so the app has to be told rather than left
        // running on the settings of the save that was just replaced.
        onRestored: () => {
          this.adoptProfile();
          this.applyFeedbackPrefs();
          this.show("home");
        },
      });
    }
    if (id === "antup") {
      return buildSpeciesPage(this.profile, {
        species: this.speciesPage,
        onBack: () => this.show("antarium"),
        onTraits: () => this.openTraits(this.speciesPage, "antup"),
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
  /* ----------------------------------------------------------------------- HOME */

  private buildHome(): HTMLElement {
    const root = screenEl("home");

    /*
     * The bar, and the granary emptied directly under the figure it pays into.
     *
     * Collecting changes the colony, so the bar has to be redrawn — but only the bar.
     * Rebuilding the screen would re-run the artwork and throw away the deck's slide for
     * one number, so the bar is rebuilt in place and the pill keeps its own state.
     */
    let bar = this.homeBar(root);
    root.appendChild(bar);
    this.rebuildHomeBar = (): void => {
      const fresh = this.homeBar(root);
      bar.replaceWith(fresh);
      bar = fresh;
    };

    // Two floating buttons down the right edge. The legacy build sizes and stacks them
    // against the top bar at runtime; syncFabs does the same measurement.
    const settings = el("button", "settingsfab");
    settings.title = "Menu";
    settings.setAttribute("aria-label", "Menu");
    // `currentColor`, not a fixed white: the button's face is a light one now, and a
    // hardcoded white icon on it is an invisible button.
    settings.appendChild(icon("menu", 19));
    settings.onclick = () => this.openMenu();

    const duels = el("button", "duelfab");
    duels.title = "Challenge a friend";
    duels.setAttribute("aria-label", "Challenge a friend");
    duels.append(icon("friends", 17), el("small", undefined, "Friends"));
    // The badge is the whole receiving half of the feature: nothing else on the home
    // screen can say that somebody is waiting for an answer.
    const waiting = this.profile.duels.length;
    if (waiting > 0) duels.appendChild(el("i", "fabdot", String(waiting)));
    duels.onclick = () => this.openDuels();

    const daily = el("button", "dailyfab");
    daily.title = "Daily challenges";
    daily.append(icon("calendar", 17), el("small", undefined, "Daily"));
    daily.onclick = () => this.show("daily");
    root.append(settings, daily, duels);

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

  /**
   * The home screen's top bar, with the granary pill under it.
   *
   * Built through a method rather than inline because collecting rebuilds it: the pill
   * pays into the colony, and the colony is the biggest figure on the bar above it.
   */
  private homeBar(root: HTMLElement): HTMLElement {
    const bar = topBar(this.profile.get(), {
      onProfile: () => this.show("profile"),
      onColonyRoad: () => this.show("achievements"),
      onShop: () => this.show("shop"),
    });
    bar.appendChild(granaryPill(this.profile, (got) => {
      this.rebuildHomeBar();
      this.feedback.play("claim");
      toast(root, `Granary → +${compact(got)} troops`, "hive");
    }));
    return bar;
  }

  /**
   * What the setup screens need: the choices to write into, and where their two buttons go.
   * The flow is three screens in a row, so the shell decides the row and they decide
   * nothing about it (ui/setup.ts).
   */
  private setup(onBack: () => void, next: ScreenId): SetupOptions {
    return {
      choices: this.choices,
      profile: this.profile,
      onBack,
      onNext: () => this.show(next),
      onBegin: () => {
        this.challenge = null;
        // A duel does not go looking for a stranger. Hosting one asks WHO next; accepting
        // one already knows, and goes straight to the board with them.
        if (this.duel?.host === true) { this.show("duelpick"); return; }
        if (this.duel) { this.playDuel(this.duel.invite.from); return; }
        this.findOpponent();
      },
    };
  }

  /* -------------------------------------------------------------- MATCHMAKING */

  /**
   * The search, and the screen that shows it.
   *
   * Only the ordinary play flow comes through here. A challenge is a scenario against the
   * board rather than against a person, and the first match is a walkthrough — putting
   * either behind a search for an opponent would be a lie about what is happening.
   */
  private findOpponent(): void {
    if (this.tour.running) this.tour.signal("shape");
    // The tutorial goes straight to its arranged board: there is nobody to find.
    if (this.profile.get().tourSeen < TOUR_VERSION) { this.startMatch(); return; }

    const me = this.profile.get();
    this.clearMatchmaking();
    this.syncNav(null);
    for (const el of this.screens.values()) el.classList.add("hidden");

    const screen: MatchmakingScreen = new MatchmakingScreen(this.host, {
      you: { name: me.name, colony: me.colony, species: this.choices.species },
      // The reel shows the chapter the player is actually in, so the faces going past are
      // the ones they could plausibly be seated against.
      roster: botsForChapter(chapterOf(me.colony)),
      search: () => this.matchmaker.find(me.colony, screen.signal),
      // The halves are still parting: the match starts under them, so the camera's descent
      // plays through the widening gap rather than after it.
      onFound: (foe) => { this.matchmaking = null; this.startMatch(foe); },
    });
    this.matchmaking = screen;
    // Started here, not in the constructor: `search` above closes over `screen`.
    screen.start();
  }

  /* -------------------------------------------------------------- REPLAYS */

  /**
   * Watch a stored match back.
   *
   * A page on top of everything, like a match is: the board wants the whole screen, and
   * the deck under it would be showing through a canvas that fills it.
   */
  private watch(log: MatchLog): void {
    if (!canReplay(log)) return;
    this.clearReplay();
    this.syncNav(null);
    for (const el of this.screens.values()) el.classList.add("hidden");
    if (this.deck) this.deck.hidden = true;
    this.replay = new ReplayScreen(this.host, {
      log,
      onBack: () => { this.clearReplay(); this.show("history"); },
    });
  }

  private clearReplay(): void {
    this.replay?.destroy();
    this.replay = null;
  }

  /* ---------------------------------------------------------------- DUELS */

  /**
   * Play the person, rather than whoever the finder seats.
   *
   * It goes through the SAME matchmaking screen, and that is deliberate rather than lazy:
   * what that screen is for is the moment between choosing and playing, and a duel has one
   * too — the friend has to sit down. The only differences are that the reel stops on
   * somebody already known and that nobody else is ever seated, so `search` resolves with
   * the one person or rejects.
   */
  private playDuel(person: Person): void {
    const me = this.profile.get();
    const friend = me.friends.find((f) => f.id === person.id);
    const seat: Friend = friend ?? { ...person, since: 0 };
    this.clearMatchmaking();
    this.syncNav(null);
    for (const el of this.screens.values()) el.classList.add("hidden");

    const screen: MatchmakingScreen = new MatchmakingScreen(this.host, {
      you: { name: me.name, colony: me.colony, species: this.choices.species },
      // Their own friends go past rather than a chapter of strangers: this is a screen
      // about people the player knows, and the one it stops on is one of them.
      roster: me.friends
        .filter((f) => f.id !== seat.id)
        .map((f) => ({ name: f.name, colony: f.colony, species: f.species, human: true })),
      awaiting: seat.name,
      // Every way a challenge can end is an OUTCOME now, so anything but an accept is a
      // reason the screen can state rather than an exception it has to catch. The
      // matchmaking screen wants a promise that settles with an opponent, so the ones
      // that are not an accept become a rejection HERE — one place, with the reason kept.
      search: () => this.duels.challenge(seat, this.choices.map, screen.signal).then((out) => {
        if (out.kind !== "accepted") throw new Error(out.kind);
        // The SEED is the match: both players must open the same board, so it comes from
        // whoever set the challenge up rather than from each client separately.
        this.duelSeed = out.seed;
        return { name: out.who.name, colony: out.who.colony, species: out.who.species, human: true };
      }),
      onFound: (foe) => { this.matchmaking = null; this.duel = null; this.startMatch(foe); },
    });
    this.matchmaking = screen;
    screen.start();
  }

  /**
   * Open the challenge flow — the button under Daily on the home screen.
   *
   * ONE BUTTON FOR BOTH HALVES of the feature. It sends the player to the map picker,
   * which is where a challenge begins; if somebody has invited THEM, the same screen
   * carries the invitation on top of it, because an invitation replaces exactly that
   * choice — the ground is already picked. A second button for "invitations" would be a
   * screen that is empty almost every time it is opened.
   */
  private openDuels(): void {
    this.duel = { host: true };
    this.show("mapsel");
  }

  /** Take an invitation: the ground is theirs, the colony and the shape are still yours. */
  private acceptDuel(id: string): void {
    const invite = this.profile.answerDuel(id);
    // Gone already — accepted on another screen, or a stale button. Rebuild rather than
    // start a match against an invitation that is no longer there.
    if (!invite) { this.show("mapsel"); return; }
    this.duel = { host: false, invite };
    this.choices.map = invite.map;
    this.show("start");
  }

  private clearMatchmaking(): void {
    this.matchmaking?.destroy();
    this.matchmaking = null;
  }

  /* ---------------------------------------------------------------------- MATCH */

  private startMatch(foe?: Opponent): void {
    // The board gets its own bed. `setMusic` is idempotent, so this is safe to call for
    // every match, including a rematch straight off the result card.
    this.feedback.setMusic("match");
    if (this.tour.running) this.tour.signal("shape");
    // Whether this match is the tutorial one, decided once: the board is arranged for it
    // and the match screen runs the walkthrough on it.
    const tutorial = this.profile.get().tourSeen < TOUR_VERSION;
    // "Play again" comes straight back here, so tear the old match down first — otherwise
    // its render loop and timers keep running behind the new one.
    this.clearMatch();
    this.syncNav(null);          // the nav is hidden during a match
    // A matchmade opponent is fielded as the colony their profile showed: the head on the
    // matchmaking screen has to be the colony that turns up on the board, or the search was
    // showing something it did not mean. Only a match with nobody found rolls one.
    const aiSpecies = foe?.species ?? rollAISpecies(this.choices.species);
    setFactionColor("you", this.choices.species);
    setFactionColor("ai", aiSpecies);

    // Anthill and research come from the profile; the AI always gets the neutral set.
    const mods = this.profile.modsFor(this.choices.species);
    // Counted as the match runs: by the time it ends the surge may have lapsed and the
    // hive handed its tiles back, so the board can no longer say it happened.
    let queensTaken = 0;

    // Held rather than inlined: the opponent's nameplate is drawn from it too, and the
    // state's own `rng` has moved on by the time the board is built.
    //
    // A DUEL'S SEED IS AGREED, not rolled. Two people playing each other have to open the
    // same board or nothing replays and no server can verify it (engine/protocol.ts), so
    // when there is one it comes from whoever set the challenge up. Everything else rolls
    // its own, which is right: nobody else has to agree with it.
    const seed = this.duelSeed ?? ((Date.now() ^ (Math.random() * 0xffffffff)) | 0);
    this.duelSeed = null;
    // Named rather than rolled inline: a record has to carry the enemy's formation too, or
    // replaying it opens a different board (engine/protocol.ts).
    const enemyShape = START_SHAPES[rollShape()];
    const state = createGame({
      map: this.choices.map,
      species: { you: this.choices.species, ai: aiSpecies },
      shape: START_SHAPES[this.choices.shape],
      // The enemy picks its own formation, so the board never opens as a perfect mirror of
      // your own corner. Both sides still get exactly five tiles and identical income.
      aiShape: enemyShape,
      mods,
      seed,
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

    const me = this.profile.get();

    this.match = new MatchScreen(this.host, {
      feedback: this.feedback,
      state,
      mods,
      // WHO IS ACROSS THE BOARD — the one the search seated, so the plate on the soil is
      // the profile the player just watched the reel stop on. A match with nobody found
      // (the tutorial, a challenge) names no one.
      plates: foe && {
        you: { name: me.name, colony: me.colony },
        ai: { name: foe.name, colony: foe.colony },
      },
      // The same mods must drive combat, or Mandible/Cuticle research would show up in the
      // income readout but do nothing in a fight.
      ctx: { mods },
      /*
       * A FIRST MATCH IS PLAYED ON EASY, whatever the setting says. The walkthrough hands
       * the turn over four times and the enemy answers each one from a script; the moment
       * it ends the real opponent takes over, and the first one a new player meets should
       * not be the one that beats `normal` 96% of the time.
       *
       * A MATCHMADE OPPONENT PLAYS HARD. The bot is standing in for a person, and a person
       * who folds is worse than no opponent at all — the search would be seating someone
       * the player can see is not real. Settings' difficulty still drives a challenge.
       */
      difficulty: tutorial ? "easy" : foe ? "hard" : this.difficulty,
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
        if (kind === "tunnel") this.profile.questProgress("tunnel");
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
        const beforeColony = before.colony;
        const beforeMycel = before.mycel;
        const beforeLevel = this.profile.level().level;
        this.profile.recordResult(winner === "you", this.choices.species, state.turn, {
          playedMs: played,
          queens: queensTaken,
          byNest: reason === "nest",
        });
        // REMEMBER THE MATCH ITSELF, not just what it added up to. The career counts games
        // and wins; this is which ones. The record travels with it where it fits, so the
        // entry can be watched back (platform/history.ts).
        this.profile.rememberMatch({
          id: `m:${Date.now()}:${seed}`,
          at: Date.now(),
          map: this.choices.map,
          you: this.choices.species,
          foe: aiSpecies,
          foeName: foe?.name ?? "",
          human: foe?.human ?? false,
          winner,
          reason,
          turns: state.turn,
          playedMs: played,
          colonyBefore: beforeColony,
          colonyAfter: this.profile.get().colony,
          record: {
            setup: {
              map: this.choices.map,
              species: { you: this.choices.species, ai: aiSpecies },
              seed,
              shape: START_SHAPES[this.choices.shape],
              aiShape: enemyShape,
              mods,
            },
            moves: [...(this.match?.record ?? [])],
          },
        });
        /*
         * EVERY KIND THE POOL CAN ASK FOR IS FED FROM HERE.
         *
         * Queens, nests and turns were already being counted for the career record and
         * simply never credited to a quest, which is most of why the pool only had four
         * kinds in it. Tunnels are credited at the cast (`onAbilityCast`), because that is
         * where the ability's kind is known.
         */
        this.profile.questProgress("play");
        this.profile.questProgress("turns", state.turn);
        if (queensTaken > 0) this.profile.questProgress("queen", queensTaken);
        if (winner === "you") {
          this.profile.questProgress("win");
          if (reason === "nest") this.profile.questProgress("nest");
        }
        /*
         * A CHALLENGE PAYS ONCE, and the profile is what remembers it.
         *
         * It used to be guarded by a flag on the match, which only stopped it paying twice
         * for the same match — replaying the easiest position paid forty mycelium every
         * single run. `beatChallenge` returns false when it was already beaten and the
         * reward hangs off that; the daily is stamped by DAY, because it is meant to come
         * back.
         */
        if (this.challenge && !this.challenge.done && winner === "you") {
          this.challenge.done = true;
          const def = CHALLENGES[this.challenge.index];
          const daily = this.challenge.daily;
          const first = daily
            ? this.profile.beatDaily(dayNumber())
            : !!def && this.profile.beatChallenge(def.id);
          // Beating a daily also beats the position it drew, so the ladder moves too.
          if (daily && def) this.profile.beatChallenge(def.id);
          if (first) {
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
          colony: after.colony,
          colonyDelta: after.colony - beforeColony,
          mycel: after.mycel - beforeMycel,
          leveledTo: level > beforeLevel ? level : null,
          reason,
        });
      },
    });
    this.match.start();
  }

  private clearMatch(): void {
    // Back to the menu bed the moment the board goes away — a surrender, the result card's
    // Home, or the router being sent anywhere else mid-match.
    if (this.match) this.feedback.setMusic("menu");
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
   * numbers that actually move the player forward, the colony and mycelium, were not on it
   * at all.
   */
  /**
   * Put the result card up. The card is built elsewhere (ui/result.ts); the shell owns
   * where it goes and what its buttons do, which is the only part that is the shell's.
   */
  private showResult(winner: Player | null, recap: Recap): void {
    const ov = buildResultCard(winner, recap, {
      // Another match is another opponent: "play again" goes back through the search
      // rather than re-seating whoever was just beaten.
      onAgain: () => { this.clearOverlay(); this.findOpponent(); },
      onChangeColony: () => { this.clearOverlay(); this.show("start"); },
      onHome: () => { this.clearOverlay(); this.show("home"); },
    });
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

function syncFabs(home: HTMLElement): void {
  const daily = home.querySelector<HTMLElement>(".dailyfab");
  const settings = home.querySelector<HTMLElement>(".settingsfab");
  const duels = home.querySelector<HTMLElement>(".duelfab");
  const head = home.querySelector<HTMLElement>(".tophead");
  if (!daily || !settings) return;
  const box = daily.getBoundingClientRect();
  if (!box.width || !box.height) return;

  settings.style.width = `${box.width}px`;
  settings.style.height = `${box.height}px`;
  const top = home.getBoundingClientRect().top;
  const y = head ? head.getBoundingClientRect().bottom - top + 10 : 84;
  // Measured and stacked rather than given percentages in the stylesheet, so a third
  // button is a third step down the same column and not a fourth guess at a percentage.
  settings.style.top = `${y}px`;
  daily.style.top = `${y + (box.height + 10)}px`;
  if (duels) duels.style.top = `${y + (box.height + 10) * 2}px`;
}

/**
 * The line under the result title. The legacy build words each ending differently, and the
 * wording is the only place the *reason* a match ended is ever stated.
 */

/* ----------------------------------------------------------------------- THUMBS */

/** Board thumbnail: a checkerboard with each colony's starting corner marked. */

