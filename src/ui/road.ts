/**
 * The Trophy Road: a vertical ladder of rewards, free track on one side, pass track on the
 * other, a chapter every 500 trophies.
 *
 * The whole table comes from platform/road.ts, so this file decides nothing about what a
 * reward is worth — it renders stops and asks the store to pay out. The road runs to 20,000
 * trophies, so it builds every row once and scrolls to where the player actually is rather
 * than re-rendering on scroll.
 */
import { ROAD_CHAPTER, ROAD_STEP, rewardText, roadKey, roadStops } from "../platform";
import type { ProfileStore, RoadReward, RoadStop } from "../platform";
import { el, screenEl, screenHeader, toast } from "./chrome";

export function buildTrophyRoad(store: ProfileStore, onBack: () => void): HTMLElement {
  const root = screenEl("screen--meta");
  /** Kept across renders so claiming a reward does not throw the player back to the top. */
  let scrollTop: number | null = null;

  const render = (): void => {
    const profile = store.get();
    root.replaceChildren();
    screenHeader(root, {
      title: "Trophy Road",
      sub: "Earn trophies · claim rewards",
      onBack,
      profile,
    });

    const body = el("div", "screenbody metabody roadbody");

    /* Header strip: where the player stands, and the pass. */
    const head = el("div", "roadhead");
    const left = el("div", "roadhl");
    left.append(
      el("div", "roadt", `🏆 ${profile.trophies} trophies`),
      el("div", "roadsub", `Free reward every ${ROAD_CHAPTER} · Pass reward every ${ROAD_STEP}`),
    );
    head.appendChild(left);
    if (profile.pass) {
      head.appendChild(el("span", "passon", "PASS ✓"));
    } else {
      // The pass is not purchasable yet — the shop arrives with RevenueCat (roadmap step 5).
      const soon = el("button", "passbuy off", "Pass · soon");
      soon.disabled = true;
      head.appendChild(soon);
    }
    body.appendChild(head);

    const ladder = el("div", "road");
    let chapter = 0;
    let section: HTMLElement | null = null;

    for (const stop of roadStops()) {
      if (stop.chapter !== chapter) {
        chapter = stop.chapter;
        section = el("section", "roadchap");
        section.style.setProperty("--chapbg", chapterTint(chapter));
        const label = el("div", "roadchapter" + (profile.trophies >= (chapter - 1) * ROAD_CHAPTER ? " reached" : ""));
        label.appendChild(el("span", undefined, `Chapter ${chapter}`));
        section.appendChild(label);
        ladder.appendChild(section);
      }
      section?.appendChild(roadRow(stop, profile.trophies));
    }

    body.appendChild(ladder);
    root.appendChild(body);

    // Open on the player's current position rather than at trophy 250 — after a hundred
    // chapters the top of the list is the least useful place to land.
    requestAnimationFrame(() => {
      if (scrollTop !== null) { body.scrollTop = scrollTop; return; }
      const here = body.querySelector<HTMLElement>(".rnode.here");
      if (here) body.scrollTop = Math.max(0, here.offsetTop - body.clientHeight / 2);
    });
    body.addEventListener("scroll", () => { scrollTop = body.scrollTop; }, { passive: true });
  };

  const roadRow = (stop: RoadStop, trophies: number): HTMLElement => {
    const reached = trophies >= stop.trophies;
    const row = el("div", "roadrow");

    row.appendChild(sideCell(stop.pass, roadKey("pass", stop.trophies), "pass"));

    const centre = el("div", "rcolC" + (reached ? " reached" : ""));
    const node = el("div", "rnode" + (reached ? " done" : ""));
    // "here" is the first stop the player has NOT reached — where the screen should open.
    if (!reached && trophies + ROAD_STEP >= stop.trophies) node.classList.add("here");
    node.appendChild(el("b", undefined, reached ? "✓" : String(stop.trophies)));
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
          toast(root, `Claimed ${rewardText(reward)}`, "good");
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

/** Each chapter gets its own hue so scrolling reads as progress, not one long list. */
const chapterTint = (chapter: number): string => {
  const hue = (chapter * 47) % 360;
  return `linear-gradient(180deg, hsl(${hue} 42% 15%), hsl(${hue} 42% 10%))`;
};
