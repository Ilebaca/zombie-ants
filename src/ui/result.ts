/**
 * THE RESULT CARD: what happened, what it PAID, and what the match looked like.
 *
 * In that order, and the order is the point. The old card led with four cramped facts and
 * mentioned XP last, while the two numbers that actually move a player forward — the colony
 * and the mycelium — were not on it at all.
 *
 * It BUILDS an overlay and returns it; it does not mount it, own it, or decide what the
 * buttons do. The shell hands it three callbacks and disposes of it, so the card can be
 * built and asserted on without a running app.
 */
import { SPECIES } from "../engine";
import type { GameOverReason, Player, SpeciesId } from "../engine";
import { compact } from "../platform";
import { clockOf, el } from "./chrome";
import { icon } from "./icons";
import { GOAL_TEXT } from "./challenges";
import type { Challenge } from "./challenges";

/** Everything the card reports. Assembled by the shell from what the match actually did. */
export interface Recap {
  turns: number;
  /** The match clock, in milliseconds — the SCREEN's, never the engine's (CLAUDE.md §8a). */
  played: number;
  youArmy: number;
  species: SpeciesId;
  xpGained: number;
  colony: number;
  colonyDelta: number;
  mycel: number;
  /**
   * Larva this match paid, or `null` while the lucky hatch is still shut.
   *
   * It is banked either way (settle.ts) — null means "do not put it on the card", because
   * a currency whose only door does not open until chapter 10 is a question this screen
   * cannot answer.
   */
  larva: number | null;
  leveledTo: number | null;
  reason: GameOverReason | null;
  challenge: Challenge | null;
}

/** What its three buttons do. The card neither knows nor cares how. */
export interface ResultActions {
  onAgain: () => void;
  onChangeColony: () => void;
  onHome: () => void;
}

export function buildResultCard(
winner: Player | null, recap: Recap, act: ResultActions,
): HTMLElement {
  const won = winner === "you";
  const ov = el("div", "overlay");
  ov.id = "over";
  const wrap = el("div", "overModalWrap");

  const card = el("div", "card result " + (won ? "win" : "lose"));
  card.id = "overCard";

  const h1 = el("h1", undefined,
    recap.challenge ? (won ? "Challenge complete!" : "Challenge failed.") : (won ? "Victory" : "Defeat"));
  h1.id = "overTitle";
  const tag = el("div", "tag");
  tag.id = "overSub";
  if (recap.challenge) {
    // The tick is a MARK, not a glyph: ✓ and ✗ are two characters from whatever font the
    // device picked, sitting in the one line that says whether the objective was met.
    tag.append(
      document.createTextNode(`${recap.challenge.name} — ${GOAL_TEXT[recap.challenge.goal]} `),
      icon(won ? "check" : "cross", 14),
    );
  } else {
    tag.textContent = resultFlavour(won, recap.reason, recap.turns);
  }
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
    // The colony leads the card, because it is what the match was played for. A loss is
    // marked as one: the figure carries the colony's own green only when it went UP.
    reward("antarium", `${recap.colonyDelta >= 0 ? "+" : "−"}${compact(Math.abs(recap.colonyDelta))}`,
      `${compact(recap.colony)} troops`, recap.colonyDelta >= 0 ? "colony" : "colony down"),
    reward("mycel", signed(recap.mycel), "mycelium", "mycel"),
    reward("star", `+${recap.xpGained}`, "colony XP", "xp"),
  );
  card.appendChild(rewards);

  /*
   * THE LARVA IS ITS OWN LINE, not a fourth payout cell.
   *
   * A win pays one hatch, and that is a different KIND of thing from the three figures
   * above it: those are numbers going up, this is a door opening. It also cannot join
   * them — `.payouts` is three columns and a fourth cell would re-column the row on a
   * phone. Only shown once the hatch is open (Recap.larva).
   */
  if (recap.larva !== null && recap.larva > 0) {
    const line = el("div", "larvawon");
    line.id = "overLarva";
    line.append(
      icon("brood", 16),
      el("b", undefined, `+${recap.larva} larva`),
      el("span", undefined, recap.larva === 1 ? "one lucky hatch" : "lucky hatches"),
    );
    card.appendChild(line);
  }

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
  again.onclick = act.onAgain;

  const minor = el("div", "resultminor");
  const reSpecies = el("button", "ghostbtn", "Change colony");
  reSpecies.id = "reSpecies";
  reSpecies.onclick = act.onChangeColony;

  const home = el("button", "ghostbtn", "Home");
  home.id = "overHome";
  home.onclick = act.onHome;

  minor.append(reSpecies, home);
  acts.append(again, minor);
  card.appendChild(acts);

  wrap.appendChild(card);
  ov.appendChild(wrap);
  return ov;
}


const signed = (n: number): string => (n >= 0 ? `+${n}` : String(n));

function resultFlavour(won: boolean, reason: GameOverReason | null, turns: number): string {
if (reason === "surrender") {
  return `You surrendered on turn ${turns}. The hollow falls silent.`;
}
return won
  ? `Enemy nest captured on turn ${turns}. The fungus spreads.`
  : `The enemy reached your queen on turn ${turns}.`;
}
