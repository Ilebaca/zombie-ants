/**
 * The Trophy Road: a vertical ladder of rewards, pass track on the left, free track on the
 * right, a chapter every 500 trophies.
 *
 * Markup and running order are the legacy build's (road2 → roadchap → roadrow), including
 * where the header strip sits: after the ladder, so the screen opens on it when scrolled to
 * the bottom.
 *
 * The whole table comes from platform/road.ts, so this file decides nothing about what a
 * reward is worth — it renders stops and asks the store to pay out.
 */
import { ROAD_CHAPTER, ROAD_STEP, rewardText, roadKey, roadStops } from "../platform";
import type { ProfileStore, RoadReward, RoadStop } from "../platform";
import { el, screenEl, screenHeader, toast } from "./chrome";

export function buildTrophyRoad(store: ProfileStore, onBack: () => void): HTMLElement {
  const root = screenEl("achievements");
  /** Kept across renders so claiming a reward does not throw the player back to the top. */
  let scrollTop: number | null = null;

  const render = (): void => {
    const profile = store.get();
    root.replaceChildren();
    screenHeader(root, { title: "Trophy Road", sub: "Earn trophies · claim rewards", onBack });

    const body = el("div", "screenbody achbody");
    body.id = "achBody";

    const ladder = el("div", "road2");
    let chapter = 0;
    let section: HTMLElement | null = null;

    for (const stop of roadStops()) {
      if (stop.chapter !== chapter) {
        chapter = stop.chapter;
        section = el("section", "roadchap");
        const label = el("div",
          "roadchapter" + (profile.trophies >= (chapter - 1) * ROAD_CHAPTER ? " reached" : ""));
        label.appendChild(el("span", undefined, `Chapter ${chapter}`));
        section.appendChild(label);
        ladder.appendChild(section);
      }
      section?.appendChild(roadRow(stop, profile.trophies));
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
      el("div", "roadt", `🏆 ${profile.trophies} trophies`),
      el("div", "roadsub",
        `Free reward every ${ROAD_CHAPTER} · Pass reward every ${ROAD_STEP} · New chapter every ${ROAD_CHAPTER}`),
    );
    box.appendChild(left);
    if (profile.pass) {
      box.appendChild(el("span", "passon", "PASS ✓"));
    } else {
      // The pass is not purchasable yet — the shop arrives with RevenueCat (roadmap 5).
      const soon = el("button", "passbuy", "Get Pass");
      soon.onclick = () => toast(root, "The Trophy Pass arrives with the shop.", "warn");
      box.appendChild(soon);
    }
    return box;
  };

  const roadRow = (stop: RoadStop, trophies: number): HTMLElement => {
    const reached = trophies >= stop.trophies;
    const row = el("div", "roadrow");

    row.appendChild(sideCell(stop.pass, roadKey("pass", stop.trophies), "pass"));

    const centre = el("div", "rcolC" + (reached ? " reached" : ""));
    const node = el("div", "rnode" + (reached ? " done" : ""));
    if (reached) node.textContent = "✓";
    else node.appendChild(el("b", undefined, String(stop.trophies)));
    centre.appendChild(node);
    row.appendChild(centre);

    row.appendChild(sideCell(stop.free, roadKey("free", stop.trophies), "free"));
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
      el("div", "rc-btn", claimed ? "✓ Claimed" : passLocked ? "🔒 Pass" : claimable ? "Claim" : "🔒"),
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
