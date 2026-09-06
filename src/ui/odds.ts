/**
 * THE HATCH'S ODDS, AS A PANEL THAT CAN STAND ANYWHERE.
 *
 * It began inside the hatch screen, where a player rolls — which is the right place for it
 * and, on its own, is not where BOTH STORES require it to be. Google Play and Apple say the
 * same thing in almost the same words: an app offering randomised virtual items for purchase
 * must disclose the odds of each outcome *prior to purchase*. The purchase here is LARVA,
 * and larva is bought in the shop, two screens away from the panel that says what a larva is
 * worth. So the panel had to become a thing rather than a closure.
 *
 * It is derived, never restated: `tierOdds()` reads the same weights the roll uses, so a
 * printed chance cannot drift from the real one. That was already the rule (CLAUDE.md — the
 * odds are printed on the screen); this only gives it a second home.
 *
 * Five ROWS rather than a sentence, because the order is the message: the colours run from
 * the outcome that turns up most to the one that almost never does, and a player reads the
 * shape of that before they read any number on it.
 */
import { SKIN_TIERS, TRAIT_TIER, TRAIT_TIERS, tierOdds } from "../platform";
import { TIERS } from "../engine";
import { el } from "./chrome";

/** A whole number where it is one, a decimal only where the figure needs it. */
export const trimPct = (pct: number): string =>
  pct >= 10 || Number.isInteger(pct) ? String(Math.round(pct)) : pct.toFixed(1);

/**
 * Build the panel.
 *
 * `heading` is what the screen calls it. On the hatch it is "Chances", beside the egg being
 * rolled; in the shop it has to say what it is the odds OF, because a row of percentages
 * under a price with no subject is worse than no disclosure at all.
 */
export function buildOdds(heading = "Chances"): HTMLElement {
  const box = el("div", "hatchodds");
  box.appendChild(el("div", "ho-h", heading));
  for (const id of TRAIT_TIERS) {
    const tier = TRAIT_TIER[id];
    const row = el("div", "ho-row");
    row.style.setProperty("--tier", tier.colour);
    row.append(
      el("span", "ho-dot"),
      el("span", "ho-n", tier.name),
      el("span", "ho-p", `${trimPct(tierOdds(id))}%`),
    );
    box.appendChild(row);
  }
  // A skin has no chance of its own — it IS the top of this row (platform/skins.ts) — so
  // the note names the tiers rather than a second number. Printed all the same: an outcome
  // a player can get and was never told about is exactly what this panel prevents.
  const named = SKIN_TIERS.map((t) => TIERS[t].name).join(" and ");
  box.appendChild(el("div", "ho-note",
    `${named} hatches pay a colony skin, while you still have one to find.`));
  return box;
}
