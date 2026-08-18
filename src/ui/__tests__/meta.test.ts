/**
 * The progression screens, driven the way a player drives them.
 *
 * jsdom gives no canvas, so portraits come back null — that is deliberate: it proves the
 * screens survive a context they cannot draw into, which is the same failure mode as a
 * hidden tab (CLAUDE.md §10). Everything asserted here is structure and state, never looks.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { CHAMBER_MAX, RESEARCH_MAX, SPECIES, chamberCost, researchCost } from "../../engine";
import { MemoryStore, ProfileStore, SPECIES_UNLOCK, roadKey } from "../../platform";
import { buildAnthill } from "../anthill";
import { buildAntarium } from "../antarium";
import { buildTrophyRoad } from "../road";

const store = (mycel = 0, pheromone = 0, trophies = 0): ProfileStore => {
  const s = new ProfileStore(new MemoryStore());
  s.update((p) => { p.mycel = mycel; p.pheromone = pheromone; p.trophies = trophies; });
  return s;
};

const click = (el: Element | null | undefined): void => {
  expect(el, "expected a clickable element").toBeTruthy();
  (el as HTMLElement).click();
};

/** The buy button on the card whose title matches. */
const buyIn = (root: HTMLElement, selector: string, name: string): HTMLButtonElement | null => {
  for (const cell of Array.from(root.querySelectorAll(selector))) {
    if (cell.textContent?.includes(name)) return cell.querySelector<HTMLButtonElement>(".buybtn");
  }
  return null;
};

// jsdom has no 2D context and logs a "not implemented" error for every portrait. Returning
// null is exactly what the screens must already handle, so make it explicit and quiet.
HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });

describe("anthill screen", () => {
  it("lists every chamber with its level", () => {
    const s = store();
    const root = buildAnthill(s, () => {});
    expect(root.querySelectorAll(".chcard").length).toBe(Object.keys(CHAMBER_MAX).length);
    expect(root.textContent).toContain("Royal Chamber");
    expect(root.textContent).toContain("Lv 0/5");
  });

  it("buys a level and re-renders with the new one", () => {
    const s = store(chamberCost(0));
    const root = buildAnthill(s, () => {});
    click(buyIn(root, ".chcard", "Royal Chamber"));
    expect(s.get().hill.royal).toBe(1);
    expect(root.textContent).toContain("Lv 1/5");
    // Spent down to nothing, so the button must now be dead rather than merely wrong.
    expect(buyIn(root, ".chcard", "Royal Chamber")?.disabled).toBe(true);
  });

  it("does not spend when the player cannot afford the level", () => {
    const s = store(chamberCost(0) - 1);
    const root = buildAnthill(s, () => {});
    const btn = buyIn(root, ".chcard", "Royal Chamber");
    expect(btn?.disabled).toBe(true);
    click(btn);                                  // a disabled button still takes the tap
    expect(s.get().hill.royal ?? 0).toBe(0);
    expect(s.get().mycel).toBe(chamberCost(0) - 1);
  });

  it("shows MAX instead of a price once a chamber is capped", () => {
    const s = store(100000);
    for (let i = 0; i < CHAMBER_MAX.royal; i++) s.buyChamber("royal");
    const root = buildAnthill(s, () => {});
    expect(buyIn(root, ".chcard", "Royal Chamber")?.textContent).toBe("MAX");
  });

  it("goes back when the back button is tapped", () => {
    let backs = 0;
    const root = buildAnthill(store(), () => { backs++; });
    click(root.querySelector(".backbtn"));
    expect(backs).toBe(1);
  });
});

describe("antarium screen", () => {
  it("shows every species in the collection grid", () => {
    const root = buildAntarium(store(), { onBack: () => {} });
    expect(root.querySelectorAll(".antcell").length).toBe(Object.keys(SPECIES).length);
  });

  it("marks locked species with their price and owned ones with research", () => {
    const root = buildAntarium(store(), { onBack: () => {} });
    const cells = Array.from(root.querySelectorAll(".antcell"));
    const weaver = cells.find((c) => c.textContent?.includes("Weaver Ant"));
    expect(weaver?.className).toContain("locked");
    expect(weaver?.textContent).toContain(String(SPECIES_UNLOCK.weaver));
    const fire = cells.find((c) => c.textContent?.includes("Fire Ant"));
    expect(fire?.className).toContain("owned");
    expect(fire?.textContent).toContain("Research 0/");
  });

  it("opens a species page and comes back to the grid", () => {
    const root = buildAntarium(store(), { onBack: () => {} });
    const cells = Array.from(root.querySelectorAll(".antcell"));
    click(cells.find((c) => c.textContent?.includes("Fire Ant")));
    expect(root.querySelector(".screenh")?.textContent).toBe("Fire Ant");
    expect(root.textContent).toContain("Wildfire");
    click(root.querySelector(".backbtn"));
    expect(root.querySelectorAll(".antcell").length).toBe(Object.keys(SPECIES).length);
  });

  const openSpecies = (root: HTMLElement, name: string): void => {
    click(Array.from(root.querySelectorAll(".antcell")).find((c) => c.textContent?.includes(name)));
  };

  it("buys a research level and shows the new one", () => {
    const s = store(0, researchCost(0));
    const root = buildAntarium(s, { onBack: () => {} });
    openSpecies(root, "Fire Ant");
    click(buyIn(root, ".rtrack", "Mandible muscle"));
    expect(s.get().research.fire?.mandible).toBe(1);
    expect(s.get().pheromone).toBe(0);
    // The page stays on the same species after the purchase.
    expect(root.querySelector(".screenh")?.textContent).toBe("Fire Ant");
    expect(root.querySelectorAll(".rtrack .pip.on").length).toBe(1);
  });

  it("shows the ability cooldown dropping only at max research", () => {
    const s = store(0, 100000);
    const root = () => {
      const r = buildAntarium(s, { onBack: () => {} });
      openSpecies(r, "Fire Ant");
      return r;
    };
    expect(root().textContent).toContain(`drops to 5t at reservoir Lv ${RESEARCH_MAX}`);
    // One level short of max must still promise the drop rather than show it.
    for (let i = 0; i < RESEARCH_MAX - 1; i++) s.buyResearch("fire", "reservoir");
    expect(root().textContent).toContain("drops to 5t at reservoir");
    s.buyResearch("fire", "reservoir");
    const maxed = root();
    expect(maxed.textContent).not.toContain("drops to");
    expect(maxed.textContent).toContain("cooldown 6t → 5t");
  });

  it("unlocks a species with mycelium and then offers research instead of a price", () => {
    const s = store(SPECIES_UNLOCK.weaver);
    const root = buildAntarium(s, { onBack: () => {} });
    openSpecies(root, "Weaver Ant");
    expect(root.textContent).toContain("Unlock");
    click(root.querySelector(".metacard .buybtn"));
    expect(s.isUnlocked("weaver")).toBe(true);
    expect(root.textContent).toContain("Research");
    expect(root.querySelectorAll(".rtrack").length).toBe(3);
  });

  /** Premium is a shop purchase (roadmap step 5) — soft currency must not reach it. */
  it("never sells a premium species for mycelium", () => {
    const s = store(100000);
    const root = buildAntarium(s, { onBack: () => {} });
    openSpecies(root, "Demon Ant");
    const btn = root.querySelector<HTMLButtonElement>(".metacard .buybtn");
    expect(btn?.disabled).toBe(true);
    click(btn);
    expect(s.isUnlocked("demon")).toBe(false);
    expect(s.get().mycel).toBe(100000);
  });

  it("fields an owned species through the callback", () => {
    let fielded = "";
    const root = buildAntarium(store(), { onBack: () => {}, onField: (id) => { fielded = id; } });
    click(Array.from(root.querySelectorAll(".antcell")).find((c) => c.textContent?.includes("Ghost Ant")));
    click(Array.from(root.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Field")));
    expect(fielded).toBe("ghost");
  });
});

describe("trophy road screen", () => {
  it("claims a reached free reward once and banks the currency", () => {
    const s = store(0, 0, 600);
    const root = buildTrophyRoad(s, () => {});
    const ready = root.querySelectorAll<HTMLButtonElement>(".roadcell.ready");
    expect(ready.length).toBeGreaterThan(0);
    click(ready[0]);
    expect(s.get().mycel + s.get().pheromone).toBeGreaterThan(0);
    expect(s.get().roadClaimed).toContain(roadKey("free", 500));
    expect(root.querySelectorAll(".roadcell.got").length).toBe(1);
  });

  it("locks the pass track until the pass is owned", () => {
    const s = store(0, 0, 600);
    const root = buildTrophyRoad(s, () => {});
    expect(root.querySelectorAll(".roadcell.passlock").length).toBeGreaterThan(0);
    for (const cell of Array.from(root.querySelectorAll<HTMLButtonElement>(".roadcell.passlock"))) {
      click(cell);
    }
    expect(s.get().roadClaimed.length).toBe(0);

    s.grantPass();
    const withPass = buildTrophyRoad(s, () => {});
    expect(withPass.querySelectorAll(".roadcell.passlock").length).toBe(0);
    expect(withPass.textContent).toContain("PASS ✓");
  });

  it("offers nothing to a player with no trophies", () => {
    const root = buildTrophyRoad(store(), () => {});
    expect(root.querySelectorAll(".roadcell.ready").length).toBe(0);
    expect(root.querySelectorAll(".rnode.here").length).toBe(1);
  });

  it("marks reached stops as done", () => {
    const root = buildTrophyRoad(store(0, 0, 1000), () => {});
    expect(root.querySelectorAll(".rnode.done").length).toBe(4);      // 250, 500, 750, 1000
  });
});
