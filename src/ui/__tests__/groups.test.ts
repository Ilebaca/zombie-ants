import { describe, expect, it } from "vitest";
import { MemoryStore, ProfileStore } from "../../platform";
import { groupSections } from "../groups";
import { buildProfile } from "../profile";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

describe("grouped information sections", () => {
  it("preserves existing controls, expanded state and following sections", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="secthead">Your save</div>
      <div class="setgroup"><div class="setrow2"><button id="toggle">Show</button></div>
        <div class="setpanel" hidden><textarea id="code">unsaved code</textarea></div></div>
      <div class="setrow2">Another row</div>
      <div class="secthead">Choices</div><div class="trgrid"><button>Trait</button></div>`;
    const toggle = root.querySelector<HTMLButtonElement>("#toggle")!;
    const panel = root.querySelector<HTMLElement>(".setpanel")!;
    const field = root.querySelector<HTMLTextAreaElement>("#code")!;
    toggle.onclick = () => { panel.hidden = !panel.hidden; };
    groupSections(root);
    const group = root.querySelector('.panel-group[data-section="Your save"]')!;
    expect(group.children).toHaveLength(2);
    expect(group.querySelector("#toggle")).toBe(toggle);
    expect(group.querySelector("#code")).toBe(field);
    expect(panel.hidden).toBe(true);
    toggle.click();
    expect(panel.hidden).toBe(false);
    expect(field.value).toBe("unsaved code");
    groupSections(root);
    expect(root.querySelectorAll(".panel-group")).toHaveLength(1);
    expect(root.querySelector(".trgrid")?.closest(".panel-group")).toBeNull();
  });

  it("keeps list scrolling on its original container", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div class="lblist"><button class="lbrow">One</button><button class="lbrow">Two</button></div>';
    const list = root.firstElementChild!;
    const first = list.firstElementChild;
    groupSections(root);
    expect(root.firstElementChild).toBe(list);
    expect(list.querySelector(".panel-group")?.firstElementChild).toBe(first);
    expect(list.querySelectorAll("[data-group-row]")).toHaveLength(2);
  });

  it("groups actual profile records and collection without changing progress", () => {
    const store = new ProfileStore(new MemoryStore());
    const before = JSON.stringify(store.get());
    let quests = 0;
    const root = buildProfile(store, {
      onBack: () => {}, onColonies: () => {}, onChambers: () => {},
      onQuests: () => { quests++; }, onHistory: () => {},
      onTraits: () => {}, onAvatars: () => {},
    });
    const record = root.querySelector('.panel-group[data-section="Record"]')!;
    expect(record.querySelectorAll(".pf-colony")).toHaveLength(1);
    expect(record.querySelectorAll(".pf-stat")).toHaveLength(6);
    const field = root.querySelector('.panel-group[data-section="In the field"]')!;
    expect(field.querySelectorAll(".pf-stat")).toHaveLength(4);
    field.querySelector<HTMLButtonElement>(".pf-row")!.click();
    expect(quests).toBe(1);
    expect(root.querySelectorAll('.panel-group[data-section="Collection"] .pf-row').length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(store.get())).toBe(before);
  });
});
