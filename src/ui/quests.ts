/**
 * Daily quests: today's three tasks, their progress, and the streak.
 *
 * The screen reads state and claims; it never advances progress. Progress comes from what a
 * match actually did (app.ts), so opening this screen can never award anything by itself.
 */
import { QUEST_SWEEP_BONUS, isClaimable, isComplete, msUntilRollover, questDef } from "../platform";
import type { ProfileStore, QuestState } from "../platform";
import { card, el, screenEl, screenHeader, toast } from "./chrome";

export function buildQuests(store: ProfileStore, onBack: () => void): HTMLElement {
  const root = screenEl("screen--meta");

  const render = (): void => {
    const quests = store.dailyQuests();
    const profile = store.get();
    root.replaceChildren();
    screenHeader(root, {
      title: "Quests",
      sub: "Daily tasks · resets at midnight",
      onBack,
      profile,
    });

    const body = el("div", "screenbody metabody");

    const head = el("div", "queststreak");
    head.append(
      el("div", "qstreak", `🔥 Streak: ${profile.questStreak} day${profile.questStreak === 1 ? "" : "s"}`),
      el("div", "qreset", `Resets in ${countdown(msUntilRollover())}`),
    );
    body.appendChild(head);

    const claimedCount = quests.filter((q) => q.claimed).length;
    const list = card("Today's quests", `${claimedCount}/${quests.length} claimed`);
    for (const q of quests) list.body.appendChild(questRow(q));
    body.appendChild(list.root);

    // The sweep bonus is the reason to finish the third one, so it is stated, not hidden.
    const bonus = card("Sweep bonus", claimedCount === quests.length ? "claimed" : "unclaimed");
    bonus.body.appendChild(el("div", "mcnote",
      `Claim all ${quests.length} in a day for +${QUEST_SWEEP_BONUS.mycel} 🍄 and ` +
      `+${QUEST_SWEEP_BONUS.pheromone} 🧪, and keep the streak alive.`));
    body.appendChild(bonus.root);

    root.appendChild(body);
  };

  const questRow = (state: QuestState): HTMLElement => {
    const def = questDef(state.id);
    const row = el("div", "qrow");
    if (!def) return row;

    const info = el("div", "qb");
    info.appendChild(el("div", "qn", def.text));

    const bar = el("div", "qbar");
    const fill = el("div", "qfill");
    fill.style.width = `${Math.min(100, (state.progress / def.goal) * 100)}%`;
    bar.appendChild(fill);
    info.appendChild(bar);

    info.appendChild(el("div", "qmeta",
      `${Math.min(state.progress, def.goal)}/${def.goal} · +${def.mycel} 🍄  +${def.pheromone} 🧪`));
    row.appendChild(info);

    if (state.claimed) {
      row.appendChild(el("div", "qdone", "✓"));
    } else if (isClaimable(state)) {
      const claim = el("button", "buybtn", "Claim");
      claim.onclick = () => {
        if (store.claimQuest(state.id)) {
          render();
          toast(root, `Claimed: ${def.text}`, "good");
        }
      };
      row.appendChild(claim);
    } else {
      const pending = el("button", "buybtn off", isComplete(state) ? "Claim" : "In progress");
      pending.disabled = true;
      row.appendChild(pending);
    }
    return row;
  };

  render();
  return root;
}

/** "3h 04m" — minutes only; a ticking seconds counter would need a timer per screen. */
function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
