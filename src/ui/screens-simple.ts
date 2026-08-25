/**
 * The small screens: how-to-play, settings, and the placeholders behind the slide-in menu.
 *
 * Each is the legacy build's markup for that screen, so the ported stylesheet applies to
 * them unchanged. The placeholders are deliberately faithful: the legacy build ships them
 * as "Coming soon" panels, and hiding them here would leave the menu with dead entries.
 */
import { BUILD } from "../platform";
import { el, screenEl, screenHeader } from "./chrome";
import { icon as iconMark } from "./icons";

/** How to play. A full screen in the legacy build, not a popup. */
export function buildRules(): HTMLElement {
  const root = screenEl("rules");
  // No back arrow: like the legacy build, this is a bottom-nav screen.
  screenHeader(root, { title: "How to play" });

  const body = el("div", "screenbody");
  const card = el("div", "card");
  const rules = el("div", "rules");
  rules.style.marginTop = "0";

  // Written as fragments rather than one blob so the emphasis matches the legacy copy
  // exactly — the highlighted words are what a player skims for.
  const line = (...parts: Array<string | HTMLElement>): void => {
    for (const p of parts) rules.append(typeof p === "string" ? document.createTextNode(p) : p);
    rules.append(document.createElement("br"));
  };
  const b = (t: string): HTMLElement => el("b", undefined, t);

  line(b("Goal:"), " capture the enemy ", b("nest"), " (♛). One action per turn, ", b("15s"), " per move.");
  line(b("Move / Attack"), " a neighbour — the tile you take becomes a producing ", b("stable"),
    ". Wild grey colonies must be beaten to pass.");
  line(b("Travel"), " sends troops across a path; the trail it lays stays ", b("vein"),
    " until you reinforce it. You can also travel onto your own vein to promote it.");
  line(b("Rally"), " gathers all your troops onto one tile; ", b("Advance"), " rallies them to your front line.");
  line("Tiles cut off from your nest are ", b("frozen"), " — no troops, no growth — until you reconnect them.");
  const hive = el("span", "hv", "The Hive");
  line(hive, " wakes mid-game and hardens over time. Take the Queen for a surge that grows stronger every capture.");
  line("The match runs until one colony's nest falls.");

  card.appendChild(rules);
  body.appendChild(card);
  root.appendChild(body);
  return root;
}

export interface SettingsOptions {
  onBack: () => void;
  /** Current values, shown on the buttons. */
  board: string;
  difficulty: string;
  onCycleBoard: () => void;
  onCycleDifficulty: () => void;
  /** Run the guided tour again. It is a first-run thing, so this is the only way back. */
  onReplayTutorial: () => void;
}

export function buildSettings(opts: SettingsOptions): HTMLElement {
  const root = screenEl("settings");
  screenHeader(root, { title: "Settings", sub: "Preferences", onBack: opts.onBack });

  const body = el("div", "screenbody");
  const card = el("div", "card");

  const row = (label: string, value: string, id: string, onClick?: () => void): HTMLElement => {
    const r = el("div", "setrow");
    const btn = el("button", "setbtn", value);
    btn.id = id;
    if (onClick) btn.onclick = onClick;
    else btn.disabled = true;      // sound and vibration have nothing behind them yet
    r.append(el("span", "setk", label), btn);
    return r;
  };

  card.append(
    row("Board size", opts.board, "setBoard", opts.onCycleBoard),
    row("Enemy AI", opts.difficulty, "setDiff", opts.onCycleDifficulty),
    row("Tutorial", "Replay", "setTutorial", opts.onReplayTutorial),
    row("Sound", "On", "setSound"),
    row("Vibration", "On", "setVibe"),
    // Not a setting — it is here so the build running on a phone can be read off the
    // screen. A stale cached page and a real bug look identical without it.
    row("Build", BUILD, "setBuild"),
  );
  body.appendChild(card);
  root.appendChild(body);
  return root;
}

/** News, Friends and Support are "Coming soon" panels in the legacy build too. */
export function buildComingSoon(
  id: string, title: string, sub: string, icon: string, onBack: () => void,
): HTMLElement {
  const root = screenEl(id);
  screenHeader(root, { title, sub, onBack });
  const body = el("div", "screenbody");
  const box = el("div", "comingsoon");
  const mark = el("span", "csico");
  mark.appendChild(iconMark(icon, 34));
  box.append(mark, document.createTextNode("Coming soon"));
  body.appendChild(box);
  root.appendChild(body);
  return root;
}

export interface MenuEntry {
  id: string;
  icon: string;
  label: string;
}

/** The slide-in menu behind the home screen's hamburger. */
export const MENU_ENTRIES: readonly MenuEntry[] = [
  { id: "settings", icon: "gear", label: "Settings" },
  { id: "news", icon: "news", label: "News" },
  { id: "friends", icon: "friends", label: "Friends" },
  { id: "support", icon: "support", label: "Support" },
  { id: "luckyhatch", icon: "brood", label: "Lucky hatch" },
  { id: "leaderboard", icon: "star", label: "Leaderboard" },
  { id: "achievements", icon: "trophy", label: "Trophy Road" },
];

export function buildMenu(onPick: (id: string) => void, onDismiss: () => void): HTMLElement {
  const wrap = el("div", "menuwrap");
  wrap.id = "menuPop";
  const draw = el("aside", "menudraw");
  for (const entry of MENU_ENTRIES) {
    const item = el("button", "menuitem");
    item.dataset.go = entry.id;
    const mark = el("span", "mi");
    mark.appendChild(iconMark(entry.icon, 20));
    item.append(mark, document.createTextNode(entry.label));
    item.onclick = () => onPick(entry.id);
    draw.appendChild(item);
  }
  // Tapping the dimmed area closes the drawer, as it does in the legacy build.
  wrap.onclick = (e) => { if (e.target === wrap) onDismiss(); };
  wrap.appendChild(draw);
  return wrap;
}
