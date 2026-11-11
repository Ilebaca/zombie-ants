/** The same ten level squares on the collection banner and species page. */
import { SPECIES_LEVEL_MAX, speciesLevel } from "../engine";
import { el } from "./chrome";

export function researchPips(level: number): HTMLElement {
  const done = speciesLevel(level);
  const bar = el("div", "rb-seg");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", "Colony level");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(SPECIES_LEVEL_MAX));
  bar.setAttribute("aria-valuenow", String(done));
  for (let i = 0; i < SPECIES_LEVEL_MAX; i++) {
    bar.appendChild(el("span", "rb-pip" + (i < done ? " on" : "")));
  }
  return bar;
}
