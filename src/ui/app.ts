/**
 * App shell: home → map → species → formation → match → result.
 *
 * Meta screens own *choices*; the engine owns rules. Nothing here reaches into a running
 * match — a match is created from the choices, handed to MatchScreen, and reported back
 * through `onExit`.
 */
import { MAPS, START_SHAPES, arrangeTutorial, createGame } from "../engine";
import type { MapId, MatchSetup, Player, SpeciesId } from "../engine";
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
import { settleMatch } from "./settle";
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
  CHALLENGES, buildChallenges, buildDaily,
} from "./challenges";
import { buildLeaderboard } from "./leaderboard";
import { buildShop } from "./shop";
import { buildQuests } from "./quests";
import { buildMenu } from "./screens-simple";
import { buildHatch } from "./hatch";
import { buildNews } from "./news";
import { buildWhatsNew } from "./whatsnew";
import { buildFriends } from "./friends";
import { buildSupport } from "./support";
import { buildSettings } from "./settings";
import { buildRules } from "./rules";
import { buildFormationSelect, buildMapSelect, buildSpeciesSelect, rollAISpecies, rollShape } from "./setup";
import { buildDuelPick, inviteBar } from "./duel";
import { ReplayScreen, buildHistory } from "./history";
import { canReplay } from "../platform";
import { LocalAccounts } from "../platform";
import type { Account, AccountService } from "../platform";
import { buildSignIn } from "./signin";
import { askToPersist, defaultStore, majorSince, onHardwareBack, saveRisk } from "../platform";
import { SuspendStore } from "../platform";
import type { Resumed, SuspendDifficulty } from "../platform";
import type { SaveRisk } from "../platform";
import { buildKeepSafe } from "./keepsafe";
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
  | "luckyhatch" | "leaderboard" | "shop" | "traits" | "inventory" | "keepsafe";

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
/**
 * How many matches before the app mentions keeping the save.
 *
 * Three: enough that a player has a colony they would be annoyed to lose, and few enough
 * that they still have it when they are told.
 */
const GUARD_AFTER_GAMES = 3;

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
  private readonly feedback: Feedback;
  /** Redraw the home top bar in place. Set when home is built; a no-op before that. */
  private rebuildHomeBar: () => void = () => {};
  /** The challenge being played, if this match is one. */
  private challenge: { index: number; done: boolean; daily: boolean } | null = null;

  /**
   * THE MATCH THIS COLONY LEFT UNFINISHED (platform/suspend.ts).
   *
   * Derived from the profile every time rather than held, because signing into another
   * account changes which save "this colony" means — and a held one would go on writing
   * the new colony's match into the old colony's slot.
   */
  private get suspended(): SuspendStore {
    const { store, key } = this.profile.slot;
    return new SuspendStore(store, key);
  }

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

  /**
   * Which colony is signed in, and the roster behind it (platform/accounts.ts).
   *
   * An interface, like every other seam in this layer: today the accounts are save slots
   * on this device, and a server-backed one is a new class handed in here.
   */
  private accounts: AccountService;

  /** True when the caller supplied the save, which is what skips the sign-in screen. */
  private given: boolean;

  /**
   * What this device is doing to the save (platform/persistence.ts).
   *
   * Settled once at boot and kept, because asking the browser to keep the storage is
   * ASYNCHRONOUS and the home screen cannot await a promise to decide whether to draw a
   * row — it would draw it a frame late, on the one screen the player is looking at.
   * "none" until the answer arrives, so nothing warns about a risk that turns out not to
   * exist.
   */
  private risk: SaveRisk = "none";

  /** Unwires the hardware back button. Only the native shell has one. */
  private dropBack: () => void = () => {};

  constructor(
    private host: HTMLElement,
    profile?: ProfileStore,
    accounts: AccountService = new LocalAccounts(),
    /**
     * Sound and haptics. Handed in only by a test that needs to WATCH it — `makeFeedback`
     * already answers with a silent device where there is no audio, so the shipped app
     * never passes one.
     */
    feedback: Feedback = makeFeedback(),
  ) {
    this.feedback = feedback;
    this.host.replaceChildren();
    this.accounts = accounts;
    // A STORE HANDED IN IS THE COLONY, and there is nothing to sign into — that is the
    // path every test and every tool takes. Left to itself the app opens the account that
    // is signed in, and puts the sign-in screen up when none is; on a device that already
    // has a save that never happens, because the roster adopts it (platform/accounts.ts).
    this.given = !!profile;
    this.profile = profile ?? this.signedInStore();
    this.tour = new Tour(host);
    // Reopen on the player's last setup, so a rematch is two taps.
    const saved = this.profile.get();
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
    // ANDROID'S BACK BUTTON. In a WebView there is no history to go back through, so the
    // shell's own answer to a press is to CLOSE THE APP — anywhere, mid-match included.
    // A no-op in a browser (platform/back.ts).
    this.dropBack = onHardwareBack(() => this.goBack());
    // ASK THE BROWSER TO KEEP THE STORAGE, and settle what it said. Chromium grants this
    // silently and a granted origin is never evicted; iOS refuses, which is the answer
    // that puts the prompt on home. It is fire-and-forget: the game must never wait on it.
    void this.settleRisk();
    // NOTHING OPENS BEFORE A COLONY IS CHOSEN. The tour, the deck and the home artwork all
    // read the save, so a device with no account signed in gets the sign-in screen and
    // nothing else — and it hands over to exactly this path once it has one.
    if (!this.given && !this.accounts.current()) { this.showSignIn(); return; }
    this.show("home");
    // First run only. `tourSeen` is written when the walk finishes OR is skipped, so a
    // player who knows the game sees it once and never again.
    if (this.profile.get().tourSeen < TOUR_VERSION) { this.startTour(); return; }
    // AND ONLY THEN, WHAT CHANGED WHILE THEY WERE AWAY. After the tour check rather than
    // beside it: a first-run player is being walked through the game and must not meet a
    // card about a build they have never seen — and their save is stamped as caught up
    // anyway (platform/profile.ts), so this is belt and braces on the one screen where
    // getting it wrong is worst.
    this.showWhatsNew();
  }

  /**
   * Tear the shell down.
   *
   * There is one of these per page in the shipped app, so this exists for the hardware
   * back button rather than for tidiness: its listener lives on the far side of the
   * Capacitor bridge and would otherwise go on calling into an App that is gone.
   */
  destroy(): void {
    this.dropBack();
    this.dropBack = () => {};
    this.clearMatch();
    this.clearReplay();
    this.clearMatchmaking();
  }

  /**
   * Ask for persistent storage, then re-show home if the answer changed anything.
   *
   * The redraw is conditional and only touches home: it lands a beat after boot, and
   * rebuilding a screen the player has already walked away from would take them back.
   */
  private async settleRisk(): Promise<void> {
    const persisted = await askToPersist();
    const risk = saveRisk(defaultStore(), persisted);
    if (risk === this.risk) return;
    this.risk = risk;
    // Home is a DECK slide, so it is rebuilt through the deck's own `refresh` rather than
    // by re-showing it: `show("home")` while home is already the slide on screen only
    // slides the rail, which does not rebuild anything. `refresh` is the one path a deck
    // screen is ever rebuilt by, which is what keeps this from becoming a second one.
    this.deck?.refresh("home");
  }

  /** The save behind whoever is signed in, or a throwaway one until somebody is. */
  private signedInStore(): ProfileStore {
    const account = this.accounts.current();
    return account ? this.accounts.storeFor(account) : new ProfileStore();
  }

  /**
   * The sign-in screen, and what happens on the other side of it.
   *
   * Entering an account SWAPS the store the whole shell reads, so everything held on the
   * app object beside the save — the difficulty, the last map — has to be taken off the
   * new one (`adoptProfile`). That is the same trap a restored backup code has, and the
   * same function fixes it.
   */
  private showSignIn(): void {
    this.host.replaceChildren();
    this.host.appendChild(buildSignIn(this.accounts, {
      onEnter: (account: Account) => this.enter(account),
    }));
  }

  private enter(account: Account): void {
    // THROUGH `signIn`, never straight to `storeFor`. Opening the store alone reads the
    // save but signs nobody in, so the next launch would show the picker again — and the
    // roster would never learn which colony this device actually plays.
    const on = this.accounts.signIn(account.id) ?? account;
    this.profile = this.accounts.storeFor(on);
    this.adoptProfile();
    this.applyFeedbackPrefs();
    this.host.replaceChildren();
    this.deck = null;
    this.show("home");
    if (this.profile.get().tourSeen < TOUR_VERSION) this.startTour();
  }

  /** Leave the colony without destroying it, and go back to the picker. */
  private signOut(): void {
    this.accounts.signOut();
    this.tour.stop();
    this.deck = null;
    this.showSignIn();
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

  /**
   * "WHAT'S NEW" — the major posts a returning player has not seen (ui/whatsnew.ts).
   *
   * A build goes out every few days and nothing told anybody anything had moved: News sat
   * behind the drawer with a small badge, which is the right home for a FEED and no way at
   * all to say "the thing that annoyed you is fixed".
   *
   * IT MARKS READ ONLY AS FAR AS THE NEWEST POST IT SHOWED. The card carries the majors and
   * nothing else, so stamping the whole feed would clear the badge on posts it never showed
   * — the card claiming to have said something it did not.
   *
   * And it goes up whether the player presses "Got it" or walks off to read the rest:
   * either way they have been told, and a card that comes back because somebody tapped the
   * wrong half of it is a card that is now in the way.
   */
  private showWhatsNew(): void {
    const posts = majorSince(this.profile.get().newsSeen);
    if (!posts.length) return;
    const upTo = posts.reduce((n, p) => Math.max(n, p.at), 0);
    const seen = (): void => { this.profile.markNewsRead(upTo); this.clearOverlay(); };

    const ov = buildWhatsNew(posts, {
      onAll: () => { seen(); this.show("news"); },
      onClose: seen,
    });
    this.host.appendChild(ov);
    this.overlay = ov;
  }

  /* ----------------------------------------------------------------------- BACK */

  /**
   * UP ONE, and whether there was an "up one" to go to.
   *
   * `false` is the answer that CLOSES the app, which is why it is only ever given on the
   * home screen with nothing over it. A back that swallowed every press would be the more
   * annoying of the two failures: an app you cannot leave with the button that leaves apps.
   *
   * The order is the order things are stacked in, and each rung is one the player can see:
   * the tour is a gate over everything, then the result card, then the drawer, then a
   * match, then a page over the deck, then the deck itself.
   *
   * A MATCH GOES HOME RATHER THAN NOWHERE, and it only can because a match survives being
   * left now (platform/suspend.ts): it is written down after every move and waiting on the
   * home screen when the player gets there. Before that, this had to either swallow the
   * press or throw the game away.
   */
  goBack(): boolean {
    // The tour holds the interface until it gets the tap it asked for. Swallowed rather
    // than obeyed: closing the app is not the answer to a step somebody is reading.
    if (this.tour.running) return true;
    if (this.overlay) { this.clearOverlay(); this.show("home"); return true; }
    if (this.menu && !this.menu.classList.contains("hidden")) { this.closeMenu(); return true; }
    if (this.match || this.replay) { this.show("home"); return true; }

    // A PAGE OVER THE DECK GOES WHERE ITS OWN BACK BUTTON GOES. Pressing the one the
    // player can see is the whole rule: a second table of "which screen is above which"
    // would be a second answer to a question the screens already answer, and it would be
    // the one that goes stale.
    //
    // A page with NO back arrow still has to go somewhere, and it goes home. How to play
    // is one — like the legacy build it is dressed as a bottom-nav screen, so it carries
    // no arrow while being reachable from home and from Settings.
    for (const [, el] of this.screens) {
      if (el.classList.contains("hidden")) continue;
      const back = el.querySelector<HTMLButtonElement>(".backbtn");
      if (back) back.click();
      else this.show("home");
      return true;
    }

    if (this.deck && !this.deck.hidden && this.deck.at !== "home") {
      this.show("home");
      return true;
    }
    return false;                     // home, with nothing over it: leave the app
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
  /**
   * Repaint the whole UI in the player's colony's colours — INCLUDING ITS SKIN.
   *
   * One method rather than a `setFactionColor` at each of the three places that recolour,
   * because a skin's palette is part of what a colony looks like and a call site that
   * forgot it would show the base colour on one screen and the skin on the next.
   */
  private paintYou(species: SpeciesId = this.choices.species): void {
    setFactionColor("you", species, this.profile.lookFor(species));
  }

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

  /**
   * The shop, opened AT something.
   *
   * A tap that asks for larva and lands at the top of a shop selling five other things has
   * not been answered. The shop is a deck slide and the deck rebuilds a screen on entry
   * (§9a), so the element does not exist until after the slide — hence the frame's wait.
   */
  private showShop(anchorId?: string): void {
    this.hideOverlayScreens();
    this.slideTo("shop", false);
    if (!anchorId) return;
    requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ block: "start" });
    });
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
      this.paintYou();
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
    if (id === "keepsafe") {
      return buildKeepSafe(this.profile, {
        risk: this.risk,
        onBack: () => this.show("home"),
        // Taking a code answers the prompt, so home must not still be offering it.
        onChanged: () => this.profile.dismissGuard(),
      });
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
    if (id === "luckyhatch") {
      return buildHatch(this.profile, {
        feedback: this.feedback,
        onBack: () => this.show("home"),
        // The plus is not a general "go shopping": it lands on the larva shelf, because
        // the tap it answers was about larva.
        onBuyLarva: () => this.showShop("shopLarva"),
        onInventory: () => this.show("inventory"),
        // A SKIN GOES NOWHERE — it is an appearance, not an item, so there is no bag to
        // send the player to. The only place it can be worn from is the colony it belongs
        // to, so that is where the prize card points.
        onColony: (species) => {
          this.speciesPage = species as SpeciesId;
          this.choices.species = species as SpeciesId;
          this.paintYou();
          this.show("antup");
        },
        // The trait went to the bag, so anything counting the bag is now stale.
        onChanged: () => { this.rebuildHomeBar(); },
      });
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
        onSignOut: () => this.signOut(),
        onKeepSafe: () => this.show("keepsafe"),
        playerCode: this.profile.get().playerId,
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
        this.paintYou();
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
      // The three floating buttons are measured off this block's bottom edge, and a
      // rebuild changes its height — collecting the granary swaps a two-line pill for a
      // one-line one, and dismissing the guard takes a whole row out. Without this they
      // stay where the old height put them.
      requestAnimationFrame(() => syncFabs(root));
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
  /**
   * "KEEP YOUR COLONY" — the one thing on home that is about losing it.
   *
   * It appears for exactly one player: the one whose device may bin the save
   * (platform/persistence.ts) and who has never taken a backup code. Everybody else sees
   * nothing, which is the only way a warning stays believable — a band that is always
   * there is a band nobody reads, and this one is telling the truth about a real clock.
   *
   * It is DISMISSIBLE and never comes back. Nagging somebody every launch about a risk
   * they have decided to accept is how a player learns to ignore the app; Settings keeps
   * the route open for ever, and the row there says whether a code was ever taken.
   */
  private saveGuard(): HTMLElement | null {
    const p = this.profile.get();
    if (this.risk === "none" || p.guardSeen || p.backupAt) return null;
    // AND NOT UNTIL THERE IS SOMETHING TO LOSE. A colony of forty on its first launch is
    // not worth a warning, and spending the player's first minute on one is the surest way
    // to teach them that this band is noise — which is a real cost, because the day it
    // matters it is the only thing standing between them and losing everything. `unwritable`
    // is the exception: nothing is being saved AT ALL, and that is worth saying at once.
    if (this.risk !== "unwritable" && p.stats.games < GUARD_AFTER_GAMES) return null;

    const row = el("div", "saveguard");
    row.id = "saveGuard";

    const open = el("button", "sg-go") as HTMLButtonElement;
    open.type = "button";
    open.id = "saveGuardGo";
    open.append(
      icon(this.risk === "unwritable" ? "cross" : "granary", 17),
      el("span", "sg-t", this.risk === "unwritable"
        ? "This device is not saving"
        : "Keep your colony safe"),
      icon("next", 13),
    );
    open.onclick = () => this.show("keepsafe");

    // A dismiss that is its own control, not a corner of the row: a band whose only tap
    // opens something has no way to say no, and a warning you cannot dismiss is a warning
    // that gets resented rather than acted on.
    const no = el("button", "sg-x") as HTMLButtonElement;
    no.type = "button";
    no.id = "saveGuardHide";
    no.setAttribute("aria-label", "Dismiss");
    no.appendChild(icon("cross", 14));
    no.onclick = () => {
      this.profile.dismissGuard();
      this.rebuildHomeBar();
    };

    row.append(open, no);
    return row;
  }

  /**
   * "PICK YOUR MATCH BACK UP" — the one thing on home that is about a game already going.
   *
   * A phone call used to cost the whole match; it is written down after every move now
   * (platform/suspend.ts) and this is the way back into it. It rides in the header block
   * beside the save guard and wears its row, because they are the same thing seen twice:
   * one band under the top bar saying something is waiting on the player.
   *
   * IT SAYS WHERE IT WAS LEFT. "Resume match" alone is a button somebody presses to find
   * out what it is; the map and the turn are what make it recognisable as the game they
   * were losing on the bus.
   *
   * AND IT CAN BE PUT DOWN, on the same button, twice — the pattern the reset row and
   * removing a friend already use. Abandoning a match throws away everything it would have
   * paid, so it asks; and without a way to say no the band would sit there for ever on a
   * match the player has decided not to finish. PLAY starts a new one and replaces it,
   * which is a choice made with this band on screen right above the button.
   */
  private resumeBand(): HTMLElement | null {
    const held = this.suspended.peek();
    if (!held) return null;

    const row = el("div", "saveguard resumeband");
    row.id = "resumeBand";

    const go = el("button", "sg-go") as HTMLButtonElement;
    go.type = "button";
    go.id = "resumeGo";
    const wrap = el("div", "rb-w");
    wrap.append(
      el("span", "sg-t", "Resume your match"),
      el("span", "rb-sub", `${MAPS[held.setup.map].name} · turn ${held.turn}`),
    );
    go.append(icon("board", 16), wrap, icon("next", 13));
    go.onclick = () => this.resumeMatch();

    let armed = false;
    const drop = el("button", "sg-x") as HTMLButtonElement;
    drop.type = "button";
    drop.id = "resumeDrop";
    drop.setAttribute("aria-label", "Abandon this match");
    drop.appendChild(icon("cross", 14));
    drop.onclick = () => {
      if (!armed) {
        armed = true;
        drop.replaceChildren(el("span", "sg-t", "Sure?"));
        drop.style.width = "auto";
        drop.style.padding = "0 12px";
        return;
      }
      this.suspended.clear();
      this.rebuildHomeBar();
    };

    row.append(go, drop);
    return row;
  }

  /** Open the match that was left unfinished, on the board it was left on. */
  private resumeMatch(): void {
    const held = this.suspended.resume();
    // A record that will not replay is not resumed onto a board the match never reached
    // (platform/suspend.ts) — `resume` has already dropped it, so the band goes with it.
    if (!held) { this.rebuildHomeBar(); return; }
    this.startMatch(undefined, held);
  }

  private homeBar(root: HTMLElement): HTMLElement {
    const bar = topBar(this.profile.get(), {
      onProfile: () => this.show("profile"),
      onColonyRoad: () => this.show("achievements"),
      onShop: () => this.show("shop"),
    });
    // THE GUARD RIDES IN THE HEADER BLOCK, under the pill.
    //
    // Not as a sibling below it: the three floating buttons are positioned by measuring
    // `.tophead`'s bottom edge (`syncFabs`), so anything laid out after it lands underneath
    // them — which put the dismiss button behind the menu button, unreachable. Inside, the
    // stack measures past it and the buttons step down on their own.
    bar.appendChild(granaryPill(this.profile, (got) => {
      this.rebuildHomeBar();
      this.feedback.play("claim");
      toast(root, `Granary → +${compact(got)} troops`, "hive");
    }));
    const waiting = this.resumeBand();
    if (waiting) bar.appendChild(waiting);
    const guard = this.saveGuard();
    if (guard) bar.appendChild(guard);
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

  private startMatch(foe?: Opponent, resume?: Resumed): void {
    // The board gets its own bed. `setMusic` is idempotent, so this is safe to call for
    // every match, including a rematch straight off the result card.
    this.feedback.setMusic("match");
    if (this.tour.running) this.tour.signal("shape");
    // Whether this match is the tutorial one, decided once: the board is arranged for it
    // and the match screen runs the walkthrough on it. A resumed match is never the
    // tutorial — the walkthrough is not suspended, so there is nothing to pick up.
    const tutorial = !resume && this.profile.get().tourSeen < TOUR_VERSION;
    // A resumed challenge brings its own latch back: the scenario it was being played for,
    // and whether the reward has already been paid (ui/settle.ts).
    if (resume) this.challenge = resume.challenge ? { ...resume.challenge } : null;
    // "Play again" comes straight back here, so tear the old match down first — otherwise
    // its render loop and timers keep running behind the new one.
    this.clearMatch();
    this.syncNav(null);          // the nav is hidden during a match
    // A matchmade opponent is fielded as the colony their profile showed: the head on the
    // matchmaking screen has to be the colony that turns up on the board, or the search was
    // showing something it did not mean. Only a match with nobody found rolls one.
    // A resumed match fields exactly the colonies it opened with: the setup is the record
    // (engine/protocol.ts), and a different opponent species would replay a different board.
    const aiSpecies = resume?.setup.species.ai ?? foe?.species ?? rollAISpecies(this.choices.species);
    const mySpecies = resume?.setup.species.you ?? this.choices.species;
    const map = resume?.setup.map ?? this.choices.map;
    // The one across the board is remembered with the match, so a name and a colony size
    // on the soil do not change under the player between two sittings.
    const seated = resume?.foe ?? foe;
    // The skin's palette is part of the colony (engine/skins.ts), so the whole UI takes
    // it — the board, the chips, the buttons. The opponent always fields the basic look:
    // a colony has to read as the species it is, and the one wearing something found is
    // the player's.
    setFactionColor("you", mySpecies, this.profile.lookFor(mySpecies));
    setFactionColor("ai", aiSpecies);

    // Anthill and research come from the profile; the AI always gets the neutral set. A
    // resumed match keeps the ones it was OPENED with: research bought between two sittings
    // must not change a board that is already half played, or the record stops replaying.
    const mods = resume?.setup.mods ?? this.profile.modsFor(mySpecies);
    // Counted as the match runs: by the time it ends the surge may have lapsed and the
    // hive handed its tiles back, so the board can no longer say it happened.
    let queensTaken = resume?.queens ?? 0;

    // Held rather than inlined: the opponent's nameplate is drawn from it too, and the
    // state's own `rng` has moved on by the time the board is built.
    //
    // A DUEL'S SEED IS AGREED, not rolled. Two people playing each other have to open the
    // same board or nothing replays and no server can verify it (engine/protocol.ts), so
    // when there is one it comes from whoever set the challenge up. Everything else rolls
    // its own, which is right: nobody else has to agree with it.
    const seed = resume?.setup.seed ?? this.duelSeed
      ?? ((Date.now() ^ (Math.random() * 0xffffffff)) | 0);
    this.duelSeed = null;
    // Named rather than rolled inline: a record has to carry the enemy's formation too, or
    // replaying it opens a different board (engine/protocol.ts).
    const enemyShape = resume?.setup.aiShape ?? START_SHAPES[rollShape()];
    const myShape = resume?.setup.shape ?? START_SHAPES[this.choices.shape];
    // EVERYTHING NEEDED TO REBUILD THIS OPENING, in one place — it is what the history
    // entry is written from, and what a suspended match is resumed from. A resumed one
    // brings its own back verbatim rather than rebuilding a matching copy: two spellings
    // of one opening is two boards waiting to disagree.
    const setup: MatchSetup = resume?.setup ?? {
      map,
      species: { you: mySpecies, ai: aiSpecies },
      seed,
      shape: myShape,
      // The enemy picks its own formation, so the board never opens as a perfect mirror of
      // your own corner. Both sides still get exactly five tiles and identical income.
      aiShape: enemyShape,
      mods,
    };
    const state = resume?.state ?? createGame({
      map,
      species: { you: mySpecies, ai: aiSpecies },
      shape: myShape,
      aiShape: enemyShape,
      mods,
      seed,
    });

    // A first match played straight cannot teach the game: the Hive sleeps for ten turns
    // and five tiles of three soldiers cannot crack anything. The tutorial is played on an
    // arranged board where every lesson is available on turn one.
    if (tutorial) arrangeTutorial(state);

    if (!resume) {
      // A NEW MATCH REPLACES THE OLD ONE. Cleared here rather than left to the first move,
      // or an app closed on turn one would reopen offering the match before this one.
      this.suspended.clear();
      this.profile.update((p) => {
        p.lastMap = this.choices.map;
        p.lastSpecies = this.choices.species;
        p.lastShape = this.choices.shape;
      });
    }

    // THE MATCH IS PUT DOWN BEFORE IT IS PLAYED, and rewritten after every move.
    //
    // Written from the screen's own record rather than from anything derived, so the board
    // it is resumed onto is the board the player actually left (platform/suspend.ts). The
    // tutorial is never suspended: it is a walkthrough with an overlay counting through it,
    // and half of one is not something to hand back to anybody.
    const difficulty: SuspendDifficulty =
      resume?.difficulty ?? (tutorial ? "easy" : seated ? "hard" : this.difficulty);
    const keep = (): void => {
      if (tutorial) return;
      const held = this.match;
      if (!held) return;
      this.suspended.save({
        setup,
        moves: [...held.record],
        playedMs: held.playedMs,
        queens: queensTaken,
        turn: state.turn,
        difficulty,
        ...(seated ? { foe: {
          name: seated.name, species: seated.species,
          colony: seated.colony, human: seated.human,
        } } : {}),
        ...(this.challenge ? { challenge: { ...this.challenge } } : {}),
        at: Date.now(),
      });
    };

    for (const el of this.screens.values()) el.classList.add("hidden");
    // AND THE DECK, which is not one of them.
    //
    // A match reached through the setup flow was already over a hidden deck, because
    // `show()` hides it for any page. A CHALLENGE is not: `startChallenge` goes straight
    // here from the Challenges tab, so the strip stayed on screen underneath the board —
    // and `.challist` sat on top of the action bar, which made End turn, the ability and
    // Surrender unpressable. Measured in a browser: `elementFromPoint` at the centre of
    // the End turn button returned the challenge list.
    if (this.deck) this.deck.hidden = true;

    const me = this.profile.get();

    this.match = new MatchScreen(this.host, {
      feedback: this.feedback,
      state,
      mods,
      // WHO IS ACROSS THE BOARD — the one the search seated, so the plate on the soil is
      // the profile the player just watched the reel stop on. A match with nobody found
      // (the tutorial, a challenge) names no one.
      plates: seated && {
        you: { name: me.name, colony: me.colony },
        ai: { name: seated.name, colony: seated.colony },
      },
      // The player's colony wears what they chose; the opponent always fields the basic
      // look, so it reads as the species it is. It reaches the nest's shape on the board
      // and, through the palette above, every tile the colony holds.
      looks: { you: this.profile.lookFor(mySpecies) },
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
      difficulty,
      map,
      // Picked back up rather than started: the board is already the one it left off on,
      // so this is the moves that got it there and the clock already spent on them.
      ...(resume ? { resumed: { moves: resume.moves, playedMs: resume.playedMs } } : {}),
      // Every accepted move rewrites the suspension, which is what makes closing the app
      // mid-turn survivable.
      onProgress: keep,
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
        // A FINISHED MATCH IS NOT A SUSPENDED ONE. Cleared before anything is paid: a
        // settlement that threw would otherwise leave a decided match on the home screen
        // offering to be played again, and it would pay twice.
        this.suspended.clear();
        // The settlement is its own subject and lives in its own file: the career, the
        // match record, the quests and the challenge reward all move together and in an
        // order that matters (ui/settle.ts). What stays here is the screen state — the
        // latch that stops a challenge paying twice, and putting the card up.
        const challenge = this.challenge && !this.challenge.done
          ? { index: this.challenge.index, daily: this.challenge.daily }
          : null;
        if (this.challenge && winner === "you") this.challenge.done = true;

        const recap = settleMatch({
          store: this.profile,
          state,
          winner,
          reason,
          playedMs: played,
          queens: queensTaken,
          map,
          species: mySpecies,
          foe: {
            species: aiSpecies,
            name: seated?.name ?? "",
            human: seated?.human ?? false,
          },
          record: {
            setup,
            moves: [...(this.match?.record ?? [])],
          },
          challenge,
        });
        this.showResult(winner, recap);
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

