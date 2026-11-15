import { afterEach, expect, it } from "vitest";
import { TRAITS, TRAIT_TIERS, MemoryStore, ProfileStore } from "../../platform";
import { buildTraitSlots } from "../traits";
import { traitEmblem, traitSocket } from "../trait-emblem";

afterEach(() => document.body.replaceChildren());

it("shares one outer silhouette between the fifteen stat badges and empty sockets", () => {
  const shape = traitSocket().querySelector("path")!.getAttribute("d");
  const ids: string[] = [];
  for (const kind of ["attack","defence","cooldown"] as const) for (const tier of TRAIT_TIERS) {
    const art = traitEmblem(kind,tier);
    expect(art.dataset.kind).toBe(kind);
    expect(art.dataset.tier).toBe(tier);
    expect(art.querySelector(".trait-emblem__outline")!.getAttribute("d")).toBe(shape);
    expect(art.getAttribute("viewBox")).toBe("0 0 128 112");
    ids.push(art.querySelector("linearGradient")!.id);
  }
  expect(new Set(ids).size).toBe(15);
});

it("uses sockets for empty and locked slots, and the correct badge after equipping", () => {
  const store = new ProfileStore(new MemoryStore());
  const def = TRAITS.find(t => t.kind === "defence")!;
  const held = store.findTrait(def.id,"exceptional")!;
  const page = buildTraitSlots(store,{scope:"fire"});
  const host = document.createElement("div"); host.id = "app";
  host.appendChild(page); document.body.appendChild(host);
  expect(page.querySelectorAll(".trait-slot-row .trait-socket")).toHaveLength(5);
  page.querySelector<HTMLButtonElement>('[data-slot="0"]')!.click();
  host.querySelector<HTMLButtonElement>(`.trait-picker [data-uid="${held.uid}"]`)!.click();
  const art = host.querySelector(".trait-detail .trait-emblem") as SVGSVGElement;
  expect(art.dataset.kind).toBe("defence");
  expect(art.dataset.tier).toBe("exceptional");
  host.querySelector<HTMLButtonElement>(".trait-detail-equip")!.click();
  const worn = page.querySelector('.trait-slot-row [data-slot="0"] .trait-emblem') as SVGSVGElement;
  expect(worn.dataset.kind).toBe("defence");
  expect(worn.dataset.tier).toBe("exceptional");
  expect(store.bench("fire")[0]?.uid).toBe(held.uid);
});
