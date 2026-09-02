/**
 * THE SLIDE-IN MENU.
 *
 * This file used to be "the placeholders and the menu": News, Friends, Support and the
 * lucky hatch were all `buildComingSoon` panels, faithful to the legacy build. Every one
 * of them is a real screen now — the hatch was the last — so the placeholder is gone with
 * its markup. A "Coming soon" helper that nothing calls is an invitation to ship another
 * dead entry.
 *
 * How to play grew into a manual of its own and lives in `rules.ts`, and Settings grew
 * into a screen of its own in `settings.ts`.
 */
import { el } from "./chrome";
import { icon as iconMark } from "./icons";

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
  // The inventory sits next to the one thing that fills it. Everything found is here,
  // across every bench — the per-bench screens show only what fits THAT bench, so
  // without this there is nowhere in the app that shows a collection as a collection.
  { id: "inventory", icon: "gift", label: "Inventory" },
  { id: "luckyhatch", icon: "brood", label: "Lucky hatch" },
  { id: "leaderboard", icon: "star", label: "Leaderboard" },
  { id: "achievements", icon: "trophy", label: "Colony Road" },
];

export function buildMenu(
  onPick: (id: string) => void, onDismiss: () => void, unreadNews = 0,
): HTMLElement {
  const wrap = el("div", "menuwrap");
  wrap.id = "menuPop";
  const draw = el("aside", "menudraw");
  for (const entry of MENU_ENTRIES) {
    const item = el("button", "menuitem");
    item.dataset.go = entry.id;
    const mark = el("span", "mi");
    mark.appendChild(iconMark(entry.icon, 20));
    item.append(mark, document.createTextNode(entry.label));
    // The drawer is the only route to News, so the count has to be here or nothing in the
    // app ever says a post has landed.
    if (entry.id === "news" && unreadNews > 0) {
      item.appendChild(el("span", "menudot", String(unreadNews)));
    }
    item.onclick = () => onPick(entry.id);
    draw.appendChild(item);
  }
  // Tapping the dimmed area closes the drawer, as it does in the legacy build.
  wrap.onclick = (e) => { if (e.target === wrap) onDismiss(); };
  wrap.appendChild(draw);
  return wrap;
}
