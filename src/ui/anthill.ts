/**
 * The Anthill: buy chamber levels with mycelium.
 *
 * Markup mirrors the legacy build exactly (hillwrap → hillcut → hillgrid), because the
 * stylesheet driving it is that build's, verbatim (src/ui/game.css).
 *
 * Chambers are the account-wide half of progression — they apply to whatever species the
 * player fields. The screen only ever *asks* ProfileStore to spend; it never touches the
 * numbers itself, so an unaffordable tap is a no-op rather than a half-finished purchase.
 */
import { chamberCost } from "../engine";
import { CHAMBERS } from "../platform";
import type { ProfileStore } from "../platform";
import { buyButton, el, pips, screenEl, screenHeader, toast } from "./chrome";

export function buildAnthill(store: ProfileStore): HTMLElement {
  const root = screenEl("anthill");

  const render = (): void => {
    const profile = store.get();
    root.replaceChildren();
    // No back arrow: this is a bottom-nav tab, and the nav is how the player leaves it.
    screenHeader(root, {
      title: "Anthill",
      sub: "Nest chambers & excavation",
      mycel: profile.mycel,
    });

    const body = el("div", "screenbody sb-top");
    const wrap = el("div", "hillwrap");

    // What the colony currently brings into a match, in one glance. A chamber the player
    // has not bought yet is listed dim rather than hidden, so the screen reads as a set.
    const cut = el("div", "hillcut");
    cut.id = "hillCut";
    const cutHead = el("div", "secthead", "Colony effects in battle");
    cutHead.style.marginBottom = "6px";      // the legacy build tightens this one inline
    cut.appendChild(cutHead);
    for (const ch of CHAMBERS) {
      const level = profile.hill[ch.id] ?? 0;
      const row = el("div", "hcrow" + (level ? "" : " dim"));
      row.append(
        el("span", "hci", ch.icon),
        el("span", "hcn", ch.name),
        el("span", "hce", level ? ch.effect(level) : "—"),
      );
      cut.appendChild(row);
    }
    wrap.append(cut, el("div", "secthead", "Chambers"));

    const grid = el("div", "hillgrid");
    grid.id = "hillGrid";
    for (const ch of CHAMBERS) {
      const level = profile.hill[ch.id] ?? 0;
      const maxed = level >= ch.max;
      const cost = chamberCost(level);

      const card = el("div", "chcard");
      const top = el("div", "chtop");
      top.append(
        el("span", "chic", ch.icon),
        el("span", "chnm", ch.name),
        el("span", "chlv", `Lv ${level}/${ch.max}`),
      );
      card.append(top, el("div", "chdesc", ch.desc));

      // Current effect and next effect side by side: the reason to spend, stated plainly.
      card.appendChild(el("div", "cheff",
        (level ? `Now: ${ch.effect(level)}  →  ` : "Next: ") + (maxed ? "maxed" : ch.effect(level + 1))));

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
      card.appendChild(foot);
      grid.appendChild(card);
    }

    wrap.appendChild(grid);
    body.appendChild(wrap);
    root.appendChild(body);
  };

  render();
  return root;
}
