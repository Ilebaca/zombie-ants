/**
 * WHAT THE TWO STORES REQUIRE, held by tests rather than by memory.
 *
 * These are not gameplay rules and no player will ever notice them — which is exactly why
 * they rot. A screen gets rebuilt, a panel moves, and the app is out of compliance with
 * nothing failing. Each assertion below names the requirement it holds:
 *
 *  - Loot box odds must be disclosed BEFORE the purchase, not only where the roll happens.
 *    Google Play has required it since 2019; Apple 3.1.1: "Apps offering 'loot boxes' or
 *    other mechanisms that provide randomized virtual items for purchase must disclose the
 *    odds of receiving each type of item to customers prior to purchase."
 *  - Apple 3.1.1: "you should make sure you have a restore mechanism for any restorable
 *    in-app purchases."
 *  - Google Play requires in-app account deletion from any app that lets somebody create
 *    an account; Apple says the same in 5.1.1(v).
 *  - Apple 2.3.1: an app's "functionality should be clear to end users". This app simulates
 *    an opponent, a ladder and a friends list with no server behind any of them, and none
 *    of those may claim to be other people.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DemoGateway, MemoryStore, ProfileStore, SUPPORT_EMAIL, TRAIT_TIERS, tierOdds,
} from "../../platform";
import type { PurchaseGateway } from "../../platform";
import { buildShop } from "../shop";
import { buildSettings } from "../settings";
import { MatchmakingScreen } from "../matchmaking";
import { buildLeaderboard } from "../leaderboard";
import { buildFriends } from "../friends";
import { LocalFriendService } from "../../platform";
import type { Opponent } from "../../platform";
import { trimPct } from "../odds";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });

const store = (): ProfileStore => {
  const s = new ProfileStore(new MemoryStore());
  s.update((p) => { p.colony = 2_000_000; p.unlocked = ["leafcutter", "fire"]; });
  return s;
};

const gateway = (): PurchaseGateway => new DemoGateway();

const FOE: Opponent = { name: "Formica42", colony: 1100, species: "ghost", human: false };
const ROSTER: Opponent[] = [
  FOE,
  { name: "Nestward", colony: 900, species: "fire", human: false },
];

describe("loot box odds, before the purchase", () => {
  /**
   * The odds lived on the hatch, where a player ROLLS. The purchase is larva, and larva is
   * bought in the shop — two screens away from any statement of what a larva is worth.
   */
  it("prints every tier's chance on the screen that sells larva", () => {
    const root = buildShop(store(), gateway(), () => {});
    const text = root.textContent ?? "";
    for (const tier of TRAIT_TIERS) {
      expect(text, `${tier} has no printed chance in the shop`)
        .toContain(`${trimPct(tierOdds(tier))}%`);
    }
  });

  /** And it says what they are the odds OF. A row of percentages under a price with no
   *  subject is worse than no disclosure at all. */
  it("says what the percentages are for", () => {
    const root = buildShop(store(), gateway(), () => {});
    expect(root.textContent).toMatch(/larva can hatch/i);
  });

  /** DERIVED, never restated: a printed chance that has drifted from the real one is the
   *  game lying about the only thing a player has to go on. */
  it("reads the same weights the roll uses", () => {
    const total = TRAIT_TIERS.reduce((n, t) => n + tierOdds(t), 0);
    expect(Math.round(total)).toBe(100);
  });
});

describe("restoring a purchase", () => {
  it("offers the mechanism Apple requires", () => {
    const root = buildShop(store(), gateway(), () => {});
    expect(root.querySelector("#shopRestore"), "there is no restore control").not.toBeNull();
  });

  /**
   * AND IT SAYS WHAT IT CANNOT DO. Currency is consumable and is spent; no store hands it
   * back, and a button that implied otherwise would be the shop promising a refund.
   */
  it("says currency is not restorable", () => {
    const root = buildShop(store(), gateway(), () => {});
    expect(root.textContent).toMatch(/cannot be restored/i);
  });

  /**
   * A demo restore must GIVE NOTHING. There is no store behind it, so there is no record
   * of a purchase to find — and handing over the pass would be the one thing a restore
   * button must never do.
   */
  it("hands nothing over when there is no store behind it", async () => {
    const result = await new DemoGateway().restore();
    expect(result.ok).toBe(false);
    expect(result.grant).toBeUndefined();
  });
});

describe("deleting the account", () => {
  it("offers deletion inside the app, and asks twice", () => {
    let deleted = 0;
    const root = buildSettings({
      profile: store(),
      onBack: () => {}, difficulty: "Normal",
      onCycleDifficulty: () => {}, onHowToPlay: () => {},
      onFeedbackChanged: () => {}, onReplayTutorial: () => {}, onReset: () => {},
      onDelete: () => { deleted++; }, onSignOut: () => {}, onKeepSafe: () => {},
      onRestored: () => {}, playerCode: "ZA-TEST-TEST",
    });
    const btn = root.querySelector<HTMLButtonElement>("#setDelete");
    expect(btn, "there is no way to delete the colony").not.toBeNull();
    btn?.click();
    expect(deleted, "one tap deleted the colony").toBe(0);
    btn?.click();
    expect(deleted).toBe(1);
  });

  /** The policy URL both stores read has to explain deletion, since it is where a player
   *  who cannot find the button will look. */
  it("is explained on the privacy page, with the route", () => {
    const page = readFileSync(resolve(__dirname, "../../../public/privacy.html"), "utf8");
    expect(page).toMatch(/delete/i);
    expect(page).toContain("Delete this colony");
  });
});

describe("never claiming a simulation is other people", () => {
  /**
   * `LocalMatchmaker` seats a computer opponent every time — there is no server. The screen
   * used to say "Searching for an opponent…" and then "Opponent found", which is the app
   * claiming to have looked through other players and found one.
   */
  it("does not say it is searching for a player", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const screen = new MatchmakingScreen(host, {
      you: { name: "Ridgeback", colony: 1000, species: "fire" },
      roster: ROSTER,
      search: () => new Promise<Opponent>(() => {}),   // never resolves: the search shows
      onFound: () => {},
    });
    expect(host.textContent).not.toMatch(/searching for an opponent/i);
    screen.destroy();
  });

  it("tags the seated opponent as the computer", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const screen = new MatchmakingScreen(host, {
      you: { name: "Ridgeback", colony: 1000, species: "fire" },
      roster: ROSTER,
      search: async () => FOE,
      onFound: () => {},
    });
    screen.start();
    await vi.waitFor(() => expect(host.querySelector(".mmk-found .mmk-card")).not.toBeNull());
    expect(host.querySelector(".mmk-bot")?.textContent, "the bot was seated unlabelled")
      .toMatch(/computer/i);
    expect(host.querySelector(".mmk-status")?.textContent).not.toMatch(/opponent found/i);
    screen.destroy();
  });

  it("does not call the generated ladder a world ranking", () => {
    const root = buildLeaderboard(store(), () => {});
    expect(root.textContent).not.toMatch(/world ranking/i);
    expect(root.textContent, "the ladder does not say its rivals are generated")
      .toMatch(/generated on your device/i);
  });

  it("says the friends list is generated before anyone can send a request", () => {
    const root = buildFriends(store(), new LocalFriendService(), () => {});
    expect(root.textContent).toMatch(/generated on your device/i);
  });
});

describe("reaching a person", () => {
  /**
   * BOTH STORES REQUIRE A WORKING SUPPORT CONTACT, and this one is a placeholder. It is a
   * release blocker rather than a bug, and it is here so it cannot be forgotten: the test
   * fails the day somebody sets a real address, which is the day to delete it.
   */
  it("still has a placeholder support address — set a real one before release", () => {
    expect(SUPPORT_EMAIL, "support address looks real now; drop this test")
      .toBe("support@zombie-ants.game");
  });
});
