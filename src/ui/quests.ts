/**
 * The Colony screen: colony level, daily quests and the streak.
 *
 * Markup mirrors the legacy build (qhero → qstreak → qcard list) because the stylesheet
 * driving it is that build's, verbatim.
 *
 * The screen reads state and claims; it never advances progress. Progress comes from what a
 * match actually did (app.ts), so opening this screen can never award anything by itself.
 */
import { isClaimable, isComplete, levelReward, questDef } from "../platform";
import type { ProfileStore, QuestState } from "../platform";
import { el, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";

export function buildQuests(store: ProfileStore, onBack: () => void): HTMLElement {
  const root = screenEl("quests");

  const render = (): void => {
    const quests = store.dailyQuests();
    const profile = store.get();
    root.replaceChildren();
    screenHeader(root, { title: "Colony", sub: "Level & daily quests", onBack });

    const body = el("div", "screenbody sb-top");
    const list = el("div", "antscroll");
    list.id = "questBody";

    const head = el("div", "secthead", "Today's quests");
    head.style.marginBottom = "var(--sp3)";  // as the legacy build sets it inline
    list.append(hero(), streakLine(profile.questStreak), head);
    for (const q of quests) list.appendChild(questCard(q));

    body.appendChild(list);
    root.appendChild(body);
  };

  /** Level badge, name, and the XP bar toward the next level. */
  const hero = (): HTMLElement => {
    const profile = store.get();
    const progress = store.level();

    const box = el("div", "qhero");
    const top = el("div", "qtop");
    const badge = el("div", "qbadge");
    badge.append(el("b", undefined, String(progress.level)), el("small", undefined, "LEVEL"));
    const title = el("div", "qti");
    title.append(
      el("div", "n", profile.name),
      el("div", "s", `Colony level ${progress.level}`),
    );
    top.append(badge, title);

    const bar = el("div", "qbar");
    const fill = el("i");
    fill.style.width = `${Math.round(progress.pct * 100)}%`;
    bar.appendChild(fill);

    box.append(top, bar,
      el("div", "qxp", `${progress.into} / ${progress.need} XP to level ${progress.level + 1}`));

    // Level rewards are tapped, not auto-paid: reaching a level should feel like collecting.
    const unclaimed = store.unclaimedLevels();
    if (unclaimed.length) {
      const row = el("div", "claimrow");
      for (const level of unclaimed) {
        const chip = el("button", "claimchip", `Lvl ${level} · ${levelReward(level).label}`);
        chip.onclick = () => {
          if (store.claimLevel(level)) {
            render();
            toast(root, "Reward claimed!", "good");
          }
        };
        row.appendChild(chip);
      }
      box.appendChild(row);
    }
    return box;
  };

  const streakLine = (streak: number): HTMLElement =>
    el("div", "qstreak", `Daily streak · ${streak} day${streak === 1 ? "" : "s"}`);

  const questCard = (state: QuestState): HTMLElement => {
    const def = questDef(state.id);
    const card = el("div", "qcard");
    if (!def) return card;

    const qmark = el("span", "qic");
    qmark.appendChild(icon(def.icon, 22));
    card.appendChild(qmark);

    const info = el("div", "qb");
    info.appendChild(el("div", "qn", def.text));

    const bar = el("div", "qp");
    const fill = el("i");
    fill.style.width = `${Math.round(Math.min(1, state.progress / def.goal) * 100)}%`;
    bar.appendChild(fill);
    info.appendChild(bar);

    const rewards = [
      def.reward.mycel ? `+${def.reward.mycel} mycelium` : "",
      def.reward.pheromone ? `+${def.reward.pheromone} pheromone` : "",
    ].filter(Boolean).join("  ");
    info.appendChild(el("div", "qmeta", `+${def.xp} XP · ${rewards}`));
    card.appendChild(info);

    const act = el("div", "qact");
    if (state.claimed) {
      act.appendChild(el("button", "qbtn claimed", "Claimed"));
    } else if (isClaimable(state)) {
      const claim = el("button", "qbtn ready", "Claim");
      claim.onclick = () => {
        if (store.claimQuest(state.id)) {
          render();
          toast(root, `Claimed: ${def.text}`, "good");
        }
      };
      act.appendChild(claim);
    } else {
      // Progress doubles as the button label while a quest is unfinished, exactly as legacy.
      act.appendChild(el("button", "qbtn wip",
        isComplete(state) ? "Claim" : `${Math.min(state.progress, def.goal)}/${def.goal}`));
    }
    card.appendChild(act);
    return card;
  };

  render();
  return root;
}
