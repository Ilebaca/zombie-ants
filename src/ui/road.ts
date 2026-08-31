/**
 * The Colony Road: a vertical ladder of rewards, pass track on the left, free track on the
 * right, a chapter every two rungs.
 *
 * The rungs are GEOMETRIC (platform/road.ts) — each one a fixed multiple of the last — so
 * the ladder keeps pace with a colony that compounds, and its hundred stops run from a
 * hundred troops to past a trillion. A stop is named by its index for that reason: "is
 * this a multiple of five hundred" only answers on a ladder with even rungs.
 *
 * Markup and running order are the legacy build's (road2 → roadchap → roadrow), including
 * where the header strip sits: after the ladder, so the screen opens on it when scrolled to
 * the bottom.
 *
 * The whole table comes from platform/road.ts, so this file decides nothing about what a
 * reward is worth — it renders stops and asks the store to pay out.
 */
import { compact, rewardText, roadKey, roadStops } from "../platform";
import type { ProfileStore, RoadReward, RoadStop } from "../platform";
import { el, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";

export function buildColonyRoad(store: ProfileStore, onBack: () => void, onShop: () => void): HTMLElement {
  const root = screenEl("achievements");
  /** Kept across renders so claiming a reward does not throw the player back to the top. */
  let scrollTop: number | null = null;

  const render = (): void => {
    const profile = store.get();
    root.replaceChildren();
    screenHeader(root, { title: "Colony Road", sub: "Grow the colony · claim rewards", onBack });

    const body = el("div", "screenbody achbody");
    body.id = "achBody";

    const ladder = el("div", "road2");
    let chapter = 0;
    let section: HTMLElement | null = null;

    // The first stop the player has not reached is where they are headed. Marking it is
    // the difference between a ladder you can read at a glance and a wall of identical
    // dim cards.
    const stops = roadStops();
    const nextStop = stops.find((x) => profile.colony < x.colony)?.index ?? -1;

    for (const stop of stops) {
      if (stop.chapter !== chapter) {
        chapter = stop.chapter;
        section = el("section", "roadchap");
        const first = stops.find((x) => x.chapter === chapter);
        const label = el("div",
          "roadchapter" + (first && profile.colony >= first.colony ? " reached" : ""));
        label.appendChild(el("span", undefined, `Chapter ${chapter}`));
        section.appendChild(label);
        ladder.appendChild(section);
      }
      section?.appendChild(roadRow(stop, profile.colony, stop.index === nextStop));
    }
    body.appendChild(ladder);
    body.appendChild(head());
    root.appendChild(body);

    // Legacy opens this screen scrolled to the bottom, where the header strip sits.
    requestAnimationFrame(() => {
      body.scrollTop = scrollTop ?? body.scrollHeight;
    });
    body.addEventListener("scroll", () => { scrollTop = body.scrollTop; }, { passive: true });
  };

  /** Where the player stands, and the pass. Rendered last, as in the legacy build. */
  const head = (): HTMLElement => {
    const profile = store.get();
    const box = el("div", "roadhead");
    const left = el("div", "roadhl");
    left.append(
      el("div", "roadt", `${compact(profile.colony)} troops`),
      el("div", "roadsub",
        "Every rung is bigger than the last · Free reward each chapter · Pass pays every rung"),
    );
    box.appendChild(left);
    if (profile.pass) {
      const on = el("span", "passon", "PASS ");
      on.appendChild(icon("check", 13));
      box.appendChild(on);
    } else {
      // The shop sells the pass now, so send the player there rather than explaining.
      const buy = el("button", "passbuy", "Get Pass");
      buy.onclick = onShop;
      box.appendChild(buy);
    }
    return box;
  };

  const roadRow = (stop: RoadStop, colony: number, isNext: boolean): HTMLElement => {
    const reached = colony >= stop.colony;
    const row = el("div", "roadrow" + (isNext ? " next" : ""));

    row.appendChild(sideCell(stop.pass, roadKey("pass", stop.index), "pass"));

    const centre = el("div", "rcolC" + (reached ? " reached" : ""));
    const node = el("div", "rnode" + (reached ? " done" : ""));
    if (reached) node.appendChild(icon("check", 18));
    else node.appendChild(el("b", undefined, compact(stop.colony)));
    centre.appendChild(node);
    row.appendChild(centre);

    row.appendChild(sideCell(stop.free, roadKey("free", stop.index), "free"));
    return row;
  };

  const sideCell = (reward: RoadReward | null, key: string, track: "free" | "pass"): HTMLElement => {
    const wrap = el("div", track === "pass" ? "rcolL" : "rcolR");
    if (!reward) {
      wrap.appendChild(el("div", "roadcell empty"));
      return wrap;
    }

    const profile = store.get();
    const claimed = profile.roadClaimed.includes(key);
    const claimable = store.canClaimRoad(key);
    const passLocked = track === "pass" && !profile.pass;

    const cell = el("button", `roadcell ${track} ${cellState(claimed, claimable, passLocked)}`);
    cell.append(
      el("div", "rc-rew", rewardText(reward)),
      el("div", "rc-btn", claimed ? "Claimed" : passLocked ? "Pass only" : claimable ? "Claim" : "Locked"),
    );
    cell.disabled = !claimable;
    if (claimable) {
      cell.onclick = () => {
        if (store.claimRoad(key)) {
          render();
          toast(root, "Reward claimed!", "good");
        }
      };
    }
    wrap.appendChild(cell);
    return wrap;
  };

  render();
  return root;
}

const cellState = (claimed: boolean, claimable: boolean, passLocked: boolean): string =>
  claimed ? "got" : passLocked ? "passlock" : claimable ? "ready" : "locked";
