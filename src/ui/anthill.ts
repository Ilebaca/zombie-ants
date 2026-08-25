/**
 * The Anthill: buy chamber levels with mycelium.
 *
 * The skeleton is still the legacy build's (hillwrap → hillcut → hillgrid, `.chcard` with
 * `.chtop`/`.chdesc`/`.cheff`/`.chfoot`), because the stylesheet driving it is that build's
 * verbatim — those class names are styling, not labels (CLAUDE.md §10). What sits INSIDE
 * them is this build's, and `src/ui/skin.css` dresses it.
 *
 * Two things were wrong with the screen it replaces, and both were structural:
 *
 *  - **It listed every chamber twice.** A summary table at the top named all five and their
 *    effects, then five cards named all five and their effects again. Half a screen of
 *    scrolling to be told the same thing. The digest now shows only what the colony
 *    actually HAS — the effects, not the names, because "+2 soldiers in your base at match
 *    start" is already the name of what it does — and the cards do the shopping.
 *  - **"Now: X → Y" printed the same sentence twice on one line**, so the only thing that
 *    changed (a number) was the hardest thing to find. NOW and NEXT are two labelled rows
 *    on a shared left edge instead: the sentences line up and the eye lands on the diff.
 *
 * Chambers are the account-wide half of progression — they apply to whatever species the
 * player fields. The screen only ever *asks* ProfileStore to spend; it never touches the
 * numbers itself, so an unaffordable tap is a no-op rather than a half-finished purchase.
 */
import { chamberCost } from "../engine";
import { CHAMBERS } from "../platform";
import type { ChamberDef, ProfileStore } from "../platform";
import { buyButton, el, pips, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";

export function buildAnthill(store: ProfileStore): HTMLElement {
  const root = screenEl("anthill");

  const render = (): void => {
    const profile = store.get();
    const levelOf = (ch: ChamberDef): number => profile.hill[ch.id] ?? 0;

    root.replaceChildren();
    // No back arrow: this is a bottom-nav tab, and the nav is how the player leaves it.
    screenHeader(root, {
      title: "Anthill",
      sub: "Nest chambers & excavation",
      mycel: profile.mycel,
    });

    const body = el("div", "screenbody sb-top");
    const wrap = el("div", "hillwrap");
    wrap.append(digest(CHAMBERS, levelOf), el("div", "secthead", "Chambers"));

    const grid = el("div", "hillgrid");
    grid.id = "hillGrid";
    for (const ch of CHAMBERS) {
      grid.appendChild(chamberCard(ch, levelOf(ch), profile.mycel, () => {
        const was = levelOf(ch);
        if (!store.buyChamber(ch.id)) return;
        render();
        toast(root, `${ch.name} → Lv ${was + 1}`, "hive");
      }));
    }

    wrap.appendChild(grid);
    body.appendChild(wrap);
    root.appendChild(body);
  };

  render();
  return root;
}

/**
 * What the colony carries into a match, in one glance.
 *
 * Only chambers the player has dug appear. A row of five "—"s is not a summary of anything;
 * it is the shopping list below, greyed out. The bar gives the screen the one thing it had
 * no way to say: how far along the whole nest is.
 */
function digest(chambers: readonly ChamberDef[], levelOf: (ch: ChamberDef) => number): HTMLElement {
  const cut = el("div", "hillcut");
  cut.id = "hillCut";

  const dug = chambers.reduce((n, ch) => n + levelOf(ch), 0);
  const total = chambers.reduce((n, ch) => n + ch.max, 0);

  const head = el("div", "secthead");
  head.append(el("span", "hl-t", "In every match"), el("span", "hl-c", `${dug} / ${total}`));
  cut.appendChild(head);

  const track = el("div", "hl-track");
  const fill = el("span", "hl-fill");
  fill.style.width = `${Math.round((dug / total) * 100)}%`;
  track.appendChild(fill);
  cut.appendChild(track);

  const active = chambers.filter((ch) => levelOf(ch) > 0);
  if (!active.length) {
    const row = el("div", "hcrow dim");
    row.append(
      iconSlot("hci", "anthill", 18),
      el("span", "hcn", "Nothing excavated yet. Every level you dig here joins every match, "
        + "whichever colony you field."),
      el("span", "hce", ""),
    );
    cut.appendChild(row);
    return cut;
  }

  for (const ch of active) {
    const level = levelOf(ch);
    const row = el("div", "hcrow");
    row.append(
      iconSlot("hci", ch.icon, 18),
      el("span", "hcn", ch.effect(level)),
      el("span", "hce", `LV ${level}`),
    );
    cut.appendChild(row);
  }
  return cut;
}

/** One chamber: what it is, what it does now, what the next level buys. */
function chamberCard(ch: ChamberDef, level: number, purse: number, onBuy: () => void): HTMLElement {
  const maxed = level >= ch.max;
  const cost = chamberCost(level);

  const card = el("div", "chcard" + (level ? "" : " fresh") + (maxed ? " maxed" : ""));

  /*
   * The mark sits in a gutter of its own rather than inside the title row, so the name, the
   * description, the comparison and the footer all begin on ONE left edge — the same edge
   * the digest's rows above use. A card whose every block starts somewhere different is the
   * thing that reads as unconsidered, however carefully each block is spaced.
   */
  const top = el("div", "chtop");
  top.append(el("span", "chnm", ch.name), el("span", "chlv", `Lv ${level}/${ch.max}`));
  card.append(iconSlot("chic", ch.icon, 22), top, el("div", "chdesc", ch.desc));

  /*
   * The reason to spend, stated as a comparison rather than a sentence. Both rows carry the
   * whole phrase deliberately: they sit on one left edge, so the repetition is what makes
   * the single word that changed impossible to miss.
   */
  const eff = el("div", "cheff");
  eff.appendChild(effectRow("now", "Now", level ? ch.effect(level) : "Not excavated"));
  if (!maxed) eff.appendChild(effectRow("next", "Next", ch.effect(level + 1)));
  card.appendChild(eff);

  const foot = el("div", "chfoot");
  foot.append(
    pips(level, ch.max),
    buyButton({
      icon: "🍄",
      cost,
      maxed,
      affordable: purse >= cost,
      onBuy,
    }),
  );
  card.appendChild(foot);
  return card;
}

/** A labelled value on the card's shared left edge. */
function effectRow(kind: "now" | "next", label: string, value: string): HTMLElement {
  const row = el("div", "che-row che-" + kind);
  row.append(el("span", "che-k", label), el("span", "che-v", value));
  return row;
}

/** A mark from the icon family in a span the stylesheet already positions. */
function iconSlot(cls: string, name: string, size: number): HTMLElement {
  const box = el("span", cls);
  box.appendChild(icon(name, size));
  return box;
}
