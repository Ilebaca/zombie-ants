import { afterEach, describe, expect, it } from "vitest";
import { MemoryStore, ProfileStore } from "../../platform";
import { buildAnthill } from "../anthill";
import { dismissAnthillPopup } from "../anthill-popover";

afterEach(() => { document.body.replaceChildren(); });

function fixture() {
  const store = new ProfileStore(new MemoryStore());
  store.update(p => { p.mycel = 1000; });
  const host = document.createElement("div");
  host.id = "app";
  const root = buildAnthill(store);
  host.appendChild(root);
  document.body.appendChild(host);
  const tap = (id: string) => root.querySelector<HTMLButtonElement>(`[data-chamber="${id}"] .room`)!.click();
  return {store, host, root, tap};
}

describe("Anthill floating chamber details", () => {
  it("starts closed and opens outside the scrolling chamber list", () => {
    const {host, root, tap} = fixture();
    expect(host.querySelector(".hill-popup")).toBeNull();
    const children = root.querySelector(".nest")!.childElementCount;
    tap("royal");
    const popup = host.querySelector(".hill-popup");
    expect(popup?.parentElement).toBe(host);
    expect(root.querySelector(".room-open")).toBeNull();
    expect(root.querySelector(".nest")!.childElementCount).toBe(children);
    expect(popup?.textContent).toContain("+1 soldier in your base at match start");
    expect(root.querySelector('[data-chamber="royal"] .room')?.getAttribute("aria-expanded")).toBe("true");
  });

  it("switches rooms with a single panel and closes on a second tap", () => {
    const {host, root, tap} = fixture();
    tap("royal"); tap("brood");
    expect(host.querySelectorAll(".hill-popup")).toHaveLength(1);
    expect(host.querySelector(".hill-popup")?.getAttribute("data-chamber")).toBe("brood");
    expect(root.querySelectorAll(".nest-lvl.open")).toHaveLength(1);
    tap("brood");
    expect(host.querySelector(".hill-popup")).toBeNull();
    expect(root.querySelectorAll(".nest-lvl.open")).toHaveLength(0);
  });

  it("closes using X, Escape, an outside tap and hardware Back", () => {
    const {host, root, tap} = fixture();
    tap("royal");
    host.querySelector<HTMLButtonElement>(".hill-popup-close")!.click();
    expect(host.querySelector(".hill-popup")).toBeNull();
    tap("royal");
    host.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true}));
    expect(host.querySelector(".hill-popup")).toBeNull();
    tap("royal");
    root.querySelector<HTMLElement>(".screenh")!.click();
    expect(host.querySelector(".hill-popup")).toBeNull();
    tap("royal");
    expect(dismissAnthillPopup(host)).toBe(true);
    expect(dismissAnthillPopup(host)).toBe(false);
  });

  it("does not spend while browsing, and refreshes the same panel after a purchase", () => {
    const {store, host, root, tap} = fixture();
    tap("royal"); tap("gland"); tap("royal");
    expect(store.get().mycel).toBe(1000);
    host.querySelector<HTMLButtonElement>(".hill-popup .buybtn")!.click();
    expect(store.get().hill.royal).toBe(1);
    expect(store.get().mycel).toBe(900);
    expect(host.querySelectorAll(".hill-popup")).toHaveLength(1);
    expect(host.querySelector(".hill-popup")?.getAttribute("data-chamber")).toBe("royal");
    expect(host.querySelector(".hill-popup .che-next")?.textContent).toContain("+2 soldiers");
    expect(root.querySelector('[data-chamber="royal"] .room-lv')?.textContent).toBe("LV 1/5");
    document.body.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true}));
    expect(host.querySelector(".hill-popup")).toBeNull();
  });

  it("removes the portal when the owner is hidden or removed", async () => {
    const {host, root, tap} = fixture();
    tap("brood");
    root.classList.add("hidden");
    await Promise.resolve();
    expect(host.querySelector(".hill-popup")).toBeNull();
    root.classList.remove("hidden");
    tap("gland");
    root.remove();
    await Promise.resolve();
    expect(host.querySelector(".hill-popup")).toBeNull();
  });
});
