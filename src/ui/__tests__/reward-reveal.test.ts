import { afterEach, describe, expect, it, vi } from "vitest";
import { DAILY_GIFT, MemoryStore, ProfileStore, QUEST_SWEEP_BONUS, questDef, productById, SPECIES_UNLOCK } from "../../platform";
import { avatarArt } from "../avatars";
import { buildQuests } from "../quests";
import { buildShop } from "../shop";
import { buildProfile } from "../profile";
import { buildAntarium } from "../antarium";
import { cutCoverFor } from "../covers";
import { SPECIES } from "../../engine";
import type { PurchaseGateway } from "../../platform";
import { DemoGateway } from "../../platform";
import { shelfArt } from "../shelf";
import { buildRewardReveal, dismissRewardReveal, resourceRewards, showRewardReveal } from "../reward-reveal";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

afterEach(() => document.body.replaceChildren());

describe("full-screen reward reveals", () => {
  it("reveals only mycelium and crystals with their names, piles and amounts", () => {
    const payout = { mycel: 13, pheromone: 5, xp: 120, troops: 8, larva: 2 };
    const reveal = buildRewardReveal(resourceRewards(payout), () => {});
    const items = Array.from(reveal.querySelectorAll(".reward-item"));
    expect(items).toHaveLength(2);
    expect(items[0]?.querySelector(".reward-name")?.textContent).toBe("Mycelium");
    expect(items[0]?.querySelector("img")?.getAttribute("src")).toBe(shelfArt("mycel.1500"));
    expect(items[1]?.querySelector("img")?.getAttribute("src")).toBe(shelfArt("pher.900"));
    expect(items.map(item => item.querySelector(".reward-amount")?.textContent)).toEqual(["×13", "×5"]);
    expect(Array.from(items[0]!.children).map(node => node.className))
      .toEqual(["reward-name", "reward-art", "reward-amount"]);
    expect(reveal.querySelector("button")).toBeNull();
  });

  it("shows the actual item with only its name and dismisses on the title, art or backdrop", () => {
    for (const selector of [".reward-name", ".reward-art", ".reward-reveal"]) {
      let closed = 0;
      const reveal = buildRewardReveal([{ kind: "avatar", id: "av45" }], () => { closed++; });
      document.body.appendChild(reveal);
      expect(reveal.querySelector("img")?.getAttribute("src")).toBe(avatarArt("av45"));
      expect(reveal.querySelector(".reward-amount")).toBeNull();
      const target = selector === ".reward-reveal" ? reveal : reveal.querySelector<HTMLElement>(selector)!;
      target.click();
      reveal.click();
      expect(closed).toBe(1);
      expect(reveal.isConnected).toBe(false);
    }
  });

  it("portals out of a transformed slide, restores focus and closes with hardware Back's helper", async () => {
    const host = document.createElement("div");
    host.id = "app";
    const slide = document.createElement("div");
    slide.style.transform = "translateX(0)";
    const claim = document.createElement("button");
    slide.appendChild(claim);
    host.appendChild(slide);
    document.body.appendChild(host);
    claim.focus();
    const reveal = showRewardReveal(slide, resourceRewards({ mycel: 12 }));
    await Promise.resolve();
    expect(reveal?.parentElement).toBe(host);
    expect(document.activeElement).toBe(reveal);
    expect(dismissRewardReveal(host)).toBe(true);
    expect(document.activeElement).toBe(claim);
    expect(dismissRewardReveal(host)).toBe(false);
  });

  it("claims quests and their sweep bonus without a full-screen reveal", () => {
    const store = new ProfileStore(new MemoryStore());
    const quests = store.dailyQuests();
    const id = quests[0]!.id;
    const def = questDef(id)!;
    store.update(p => {
      p.quests = p.quests.map(q => ({
        ...q, progress: questDef(q.id)!.goal, claimed: q.id !== id,
      }));
    });
    const root = buildQuests(store, () => {});
    root.querySelector<HTMLButtonElement>(".qbtn.ready")!.click();
    const mycel = (def.reward.mycel ?? 0) + QUEST_SWEEP_BONUS.mycel;
    expect(store.get().mycel).toBe(mycel);
    expect(store.get().xp).toBe(def.xp);
    expect(root.querySelector(".reward-reveal")).toBeNull();
    expect(store.claimQuest(id)).toBe(false);
  });

  it("shows both daily-gift resources and never pays for closing or a repeated claim", () => {
    const store = new ProfileStore(new MemoryStore());
    const root = buildShop(store, new DemoGateway());
    root.querySelector<HTMLButtonElement>('[aria-label="Daily gift"]')!.click();
    expect(root.querySelectorAll(".reward-item")).toHaveLength(2);
    expect(store.get().mycel).toBe(DAILY_GIFT.mycel);
    expect(store.get().pheromone).toBe(DAILY_GIFT.pheromone);
    root.querySelector<HTMLElement>(".reward-art")!.click();
    expect(root.querySelector(".reward-reveal")).toBeNull();
    expect(store.claimDailyGift()).toBe(false);
    expect(store.get().mycel).toBe(DAILY_GIFT.mycel);
  });
  it("claims level rewards on Profile and Quests without a full-screen reveal", () => {
    for (const profile of [true, false]) {
      const store = new ProfileStore(new MemoryStore());
      store.update(p => { p.xp = 1000; });
      const level = store.unclaimedLevels()[0]!;
      const noop = (): void => {};
      const root = profile ? buildProfile(store, {
        onBack: noop, onColonies: noop, onChambers: noop, onQuests: noop,
        onHistory: noop, onTraits: noop, onAvatars: noop,
      }) : buildQuests(store, noop);
      root.querySelector<HTMLButtonElement>(".claimchip")!.click();
      expect(store.get().claimedLevels).toContain(level);
      expect(root.querySelector(".reward-reveal")).toBeNull();
    }
  });

  it("reveals only eligible currencies from the actual successful shop grant", async () => {
    const store = new ProfileStore(new MemoryStore());
    const gateway: PurchaseGateway = {
      live: true, buy: async () => ({ ok: true, grant: { mycel: 123, larva: 2 } }),
      restore: async () => ({ ok: false }),
    };
    const root = buildShop(store, gateway);
    const tile = Array.from(root.querySelectorAll(".stile"))
      .find(tile => tile.querySelector(".sh-name")?.textContent === "650")!;
    tile.querySelector<HTMLButtonElement>(".buybar")!.click();
    await vi.waitFor(() => expect(root.querySelector(".reward-reveal")).not.toBeNull());
    expect(root.querySelectorAll(".reward-item")).toHaveLength(1);
    expect(root.querySelector(".reward-amount")?.textContent).toBe("×123");
    expect(store.get().mycel).toBe(123);
    expect(store.get().larva).toBe(2);
    root.querySelector<HTMLElement>(".reward-reveal")!.click();
    expect(store.get().mycel).toBe(123);
  });

  it("reveals a species after an Antarium purchase without charging again on close", () => {
    const store = new ProfileStore(new MemoryStore());
    store.update(p => { p.mycel = SPECIES_UNLOCK.ghost; });
    const root = buildAntarium(store, { onOpenSpecies: () => {} });
    root.querySelector<HTMLElement>('.ccard[data-ant="ghost"]')!.click();
    root.querySelector<HTMLButtonElement>("#antCTA")!.click();
    expect(store.isUnlocked("ghost")).toBe(true);
    expect(store.get().mycel).toBe(0);
    expect(root.querySelector(".reward-name")?.textContent).toBe(SPECIES.ghost.name);
    expect(root.querySelector(".reward-species")?.getAttribute("src")).toBe(cutCoverFor("ghost"));
    expect(root.querySelector(".reward-amount")).toBeNull();
    root.querySelector<HTMLElement>(".reward-art")!.click();
    expect(root.querySelector(".reward-reveal")).toBeNull();
    expect(store.get().mycel).toBe(0);
  });

  it("reveals a premium species only after its successful shop purchase", async () => {
    const store = new ProfileStore(new MemoryStore());
    const root = buildShop(store, new DemoGateway());
    const tile = Array.from(root.querySelectorAll(".stile"))
      .find(tile => tile.textContent?.includes(productById("species.demon")!.title!))!;
    tile.querySelector<HTMLButtonElement>(".buybar")!.click();
    await vi.waitFor(() => expect(store.isUnlocked("demon")).toBe(true));
    expect(root.querySelector('.reward-item[data-kind="species"]')).not.toBeNull();
    expect(root.querySelector(".reward-name")?.textContent).toBe(SPECIES.demon.name);
    expect(root.querySelector(".reward-amount")).toBeNull();
  });

  it("does not reveal refused purchases even when a gateway returns a grant", async () => {
    const store = new ProfileStore(new MemoryStore());
    const gateway: PurchaseGateway = {
      live: true, buy: async () => ({ ok: false, grant: { mycel: 123 }, note: "Declined" }),
      restore: async () => ({ ok: false }),
    };
    const root = buildShop(store, gateway);
    const tile = Array.from(root.querySelectorAll(".stile"))
      .find(tile => tile.querySelector(".sh-name")?.textContent === "650")!;
    tile.querySelector<HTMLButtonElement>(".buybar")!.click();
    await vi.waitFor(() => expect(root.textContent).toContain("Declined"));
    expect(store.get().mycel).toBe(0);
    expect(root.querySelector(".reward-reveal")).toBeNull();
  });
});
