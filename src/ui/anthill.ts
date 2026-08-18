/**
 * The Anthill: buy chamber levels with mycelium.
 *
 * Chambers are the account-wide half of progression — they apply to whatever species the
 * player fields. The screen only ever *asks* ProfileStore to spend; it never touches the
 * numbers itself, so an unaffordable tap is a no-op rather than a half-finished purchase.
 */
import { chamberCost } from "../engine";
import { CHAMBERS } from "../platform";
import type { ProfileStore } from "../platform";
import { buyButton, card, el, pips, screenEl, screenHeader, toast } from "./chrome";

export function buildAnthill(store: ProfileStore, onBack: () => void): HTMLElement {
  const root = screenEl("screen--meta");

  const render = (): void => {
    const profile = store.get();
    root.replaceChildren();
    screenHeader(root, {
      title: "Anthill",
      sub: "Nest chambers & excavation",
      onBack,
      profile,
    });

    const body = el("div", "screenbody metabody");

    // What the colony currently brings into a match, in one glance. A chamber the player
    // has not bought yet is listed dim rather than hidden, so the screen reads as a set.
    const active = card("Colony effects in battle", `${totalLevels(profile.hill)} levels dug`);
    for (const ch of CHAMBERS) {
      const level = profile.hill[ch.id] ?? 0;
      const row = el("div", "effrow" + (level ? "" : " dim"));
      row.append(
        el("span", "effi", ch.icon),
        el("span", "effn", ch.name),
        el("span", "effe", level ? ch.effect(level) : "—"),
      );
      active.body.appendChild(row);
    }
    body.appendChild(active.root);

    const grid = el("div", "chgrid");
    for (const ch of CHAMBERS) {
      const level = profile.hill[ch.id] ?? 0;
      const maxed = level >= ch.max;
      const cost = chamberCost(level);

      const cell = el("div", "chcard");
      const top = el("div", "chtop");
      top.append(
        el("span", "chic", ch.icon),
        el("span", "chnm", ch.name),
        el("span", "chlv", `Lv ${level}/${ch.max}`),
      );
      cell.append(top, el("div", "chdesc", ch.desc));

      // Current effect and next effect side by side: the reason to spend, stated plainly.
      const eff = el("div", "cheff");
      eff.textContent = maxed
        ? `Now: ${ch.effect(level)} · maxed`
        : level
          ? `Now: ${ch.effect(level)}  →  ${ch.effect(level + 1)}`
          : `Next: ${ch.effect(1)}`;
      cell.appendChild(eff);

      const foot = el("div", "chfoot");
      foot.append(
        pips(level, ch.max),
        buyButton({
          icon: "🍄",
          cost,
          maxed,
          affordable: profile.mycel >= cost,
          onBuy: () => {
            if (store.buyChamber(ch.id)) {
              render();
              toast(root, `${ch.name} → Lv ${level + 1}`, "hive");
            }
          },
        }),
      );
      cell.appendChild(foot);
      grid.appendChild(cell);
    }

    body.appendChild(grid);
    root.appendChild(body);
  };

  render();
  return root;
}

const totalLevels = (hill: Readonly<Partial<Record<string, number>>>): number =>
  Object.values(hill).reduce<number>((sum, v) => sum + (v ?? 0), 0);
