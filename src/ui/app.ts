/**
 * App shell: home → map → species → formation → match → result.
 *
 * Meta screens own *choices*; the engine owns rules. Nothing here reaches into a running
 * match — a match is created from the choices, handed to MatchScreen, and reported back
 * through `onExit`.
 */
import {
  MAPS, SPECIES, START_SHAPES, armyOf, createGame,
} from "../engine";
import type { EngineEvent, GameOverReason, MapId, Player, SpeciesId } from "../engine";
import type { Difficulty } from "../ai/search";
import type { ShapeId } from "../engine";
import { DEFAULT_SPECIES, DemoGateway, ProfileStore, SPECIES_ORDER } from "../platform";
import type { PurchaseGateway } from "../platform";
import { SPECIES_COL, antHead, basicLook, hexA, setFactionColor } from "../render";
import { buildAnthill } from "./anthill";
import { buildAntarium, buildSpeciesPage } from "./antarium";
import { NAV_SCREENS, bottomNav, el, toast, topBar } from "./chrome";
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
import "./game.css";
import "./skin.css";   // the look, layered over the structure

/**
 * Route ids are the legacy build's screen ids. The stylesheet is that build's, and some of
 * its rules select by id, so these names are load-bearing.
 */
type ScreenId =
  | "home" | "mapsel" | "start" | "formation"
  | "anthill" | "antarium" | "antup" | "achievements" | "quests"
  | "challenges" | "daily" | "rules" | "settings" | "news" | "friends" | "support"
  | "leaderboard" | "shop";

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

  constructor(private host: HTMLElement, profile = new ProfileStore()) {
    this.host.replaceChildren();
    this.profile = profile;
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
  }

  /* --------------------------------------------------------------------- ROUTER */

  private show(id: ScreenId): void {
    this.clearMatch();
    this.clearOverlay();
    this.closeMenu();
    this.syncNav(id);
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
    if (id === "quests") return buildQuests(this.profile, () => this.show("home"));
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
      b.textContent = "←";
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
      onProfile: () => this.show("quests"),
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
    settings.innerHTML =
      '<svg viewBox="0 0 18 14" width="20" height="16" aria-hidden="true">' +
      '<rect width="18" height="2.8" rx="1.4" fill="currentColor"/>' +
      '<rect y="5.6" width="18" height="2.8" rx="1.4" fill="currentColor"/>' +
      '<rect y="11.2" width="18" height="2.8" rx="1.4" fill="currentColor"/></svg>';
    settings.onclick = () => this.openMenu();

    const daily = el("button", "dailyfab", "🗓️");
    daily.title = "Daily challenges";
    daily.appendChild(el("small", undefined, "Daily"));
    daily.onclick = () => this.show("daily");
    root.append(settings, daily);

    const play = el("div", "homeplay");
    play.appendChild(el("div", "hometag", "Spread · Surround · Consume"));

    const btn = el("button", "playbtn", "PLAY");
    btn.id = "goPlay";
    btn.onclick = () => this.show("mapsel");
    play.appendChild(btn);

    const how = el("button", "howtolink", "📖 How to play");
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
      const nm = document.createElement("div");
      nm.className = "snm";
      nm.textContent = def.name;
      card.appendChild(nm);
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
    requestAnimationFrame(() => selectedCard?.scrollIntoView({ inline: "center", block: "nearest" }));
    return root;
  }

  /* ----------------------------------------------------------- FORMATION SELECT */

  private buildFormationSelect(): HTMLElement {
    const el = this.screen("formation");
    this.header(el, "Choose your formation", undefined, () => this.show("start"), "formBack");

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
    // "Play again" comes straight back here, so tear the old match down first — otherwise
    // its render loop and timers keep running behind the new one.
    this.clearMatch();
    this.syncNav(null);          // the nav is hidden during a match
    const aiSpecies = rollAISpecies(this.choices.species);
    setFactionColor("you", this.choices.species);
    setFactionColor("ai", aiSpecies);

    // Anthill and research come from the profile; the AI always gets the neutral set.
    const mods = this.profile.modsFor(this.choices.species);

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
      difficulty: this.difficulty,
      // The coaching toasts run once, on the very first match a profile ever plays.
      tutorial: !this.profile.get().tutorialDone,
      onTutorialShown: () => this.profile.update((p) => { p.tutorialDone = true; }),
      map: this.choices.map,
      onAbilityCast: (kind) => {
        this.profile.update((p) => {
          p.stats.abilities++;
          if (kind === "tunnel") p.stats.tunnels++;
        });
        this.profile.questProgress("ability");
      },
      onEvents: (events) => scoreQuestEvents(this.profile, events),
      // "Strike the enemy before they strike you" is settled by the first attack of the
      // match, whoever lands it. Every other objective is decided the ordinary way.
      judge: (events) => {
        const goal = this.challenge ? CHALLENGES[this.challenge.index]?.goal : undefined;
        if (goal !== "attackFirst") return null;
        const attack = events.find((e) => e.type === "combat");
        return attack && attack.type === "combat" ? attack.attacker : null;
      },
      onExit: (winner, reason) => {
        // Snapshot before recording, so the card can report what this match actually paid.
        const beforeXp = this.profile.get().xp;
        const beforeLevel = this.profile.level().level;
        this.profile.recordResult(winner === "you", this.choices.species, state.turn);
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
          youArmy: armyOf(state, "you"),
          aiArmy: armyOf(state, "ai"),
          species: this.choices.species,
          xpGained: after.xp - beforeXp,
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
   * The result card, in the legacy build's shape: title, one line of flavour that depends
   * on how the match ended, a five-item recap, and three ways out.
   */
  private showResult(winner: Player | null, recap: {
    turns: number; youArmy: number; aiArmy: number; species: SpeciesId;
    xpGained: number; leveledTo: number | null; reason: GameOverReason | null;
    challenge: Challenge | null;
  }): void {
    const won = winner === "you";
    const ov = el("div", "overlay");
    ov.id = "over";
    const wrap = el("div", "overModalWrap");

    const card = el("div", "card " + (won ? "win" : "lose"));
    card.id = "overCard";

    const h1 = el("h1", undefined,
      recap.challenge ? (won ? "Challenge complete!" : "Challenge failed.") : (won ? "Victory" : "Defeat"));
    h1.id = "overTitle";
    const tag = el("div", "tag", recap.challenge
      ? `${recap.challenge.name} — ${GOAL_TEXT[recap.challenge.goal]}  ${won ? "✓" : "✗"}`
      : resultFlavour(won, recap.reason, recap.turns));
    tag.id = "overSub";

    const rows = el("div", "recap");
    rows.id = "overRecap";
    const stat = (k: string, v: string | number): HTMLElement => {
      const d = el("div", "rc");
      d.append(el("span", "rk", k), el("span", "rv", String(v)));
      return d;
    };
    rows.append(
      stat("Turns", recap.turns),
      stat("Your army", recap.youArmy),
      stat("Enemy army", recap.aiArmy),
      stat("Species", SPECIES[recap.species].name.split(" ")[0] ?? ""),
      stat("XP gained", `+${recap.xpGained}`),
    );
    card.append(h1, tag, rows);

    // A level-up is the one thing worth its own banner — it is why the XP line matters.
    if (recap.leveledTo !== null) {
      const banner = el("div", "recap");
      const cell = el("div", "rc");
      cell.style.cssText = "min-width:100%;background:linear-gradient(180deg,#ffd23f,#f5a623);color:#3a2a00";
      const k = el("span", "rk", "LEVEL UP");
      k.style.color = "#3a2a00";
      const v = el("span", "rv", `Colony level ${recap.leveledTo}!`);
      v.style.color = "#3a2a00";
      cell.append(k, v);
      banner.appendChild(cell);
      card.appendChild(banner);
    }

    const again = el("button", "cta", "Play again");
    again.id = "again";
    again.onclick = () => { this.clearOverlay(); this.startMatch(); };

    const reSpecies = el("button", "ghostbtn", "Change colony");
    reSpecies.id = "reSpecies";
    reSpecies.onclick = () => { this.clearOverlay(); this.show("start"); };

    const home = el("button", "ghostbtn", "← Home");
    home.id = "overHome";
    home.onclick = () => { this.clearOverlay(); this.show("home"); };

    card.append(again, reSpecies, home);
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
 * Turn a batch of engine events into quest progress ("Conquer N enemy tiles").
 *
 * Only the player's own captures count — the AI taking a tile is not progress — and the
 * whole batch is folded into one call so a Spread that claims six tiles does not write six
 * times. Exported so the translation is testable without a running match.
 */
export function scoreQuestEvents(profile: ProfileStore, events: readonly EngineEvent[]): void {
  let captured = 0;
  for (const e of events) if (e.type === "capture" && e.owner === "you") captured++;
  if (captured) profile.questProgress("conquered", captured);
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
