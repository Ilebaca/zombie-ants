/** Combine related information rows without rebuilding their controls or data. */
import { el } from "./chrome";

const HEADINGS = ".secthead, .sechead";
const ROWS = [
  ".pf-colony", ".pf-stat", ".pf-row", ".setrow", ".setrow2", ".setpanel",
  ".qcard", ".frrow", ".spq", ".spfact", ".spbox", ".spmsg",
  ".spgtrack", ".spgcard", ".spgtd", ".tropen", ".trtotal", ".fb-row",
  ".lbrow", ".lbnote", ".histrow", ".kscard", ".sirow",
].join(", ");
const LAYOUTS = [
  ".pf-stats", ".pf-coll", ".setgroup", ".frlist", ".spfaq",
  ".spfacts", ".spsent", ".spglist", ".trtotals",
].join(", ");
const LISTS = ".frlist, .lblist, .histlist, .spfaq, .spfacts, .spsent, .spglist, .pf-coll";
const GRIDS = ".pf-stats, .trtotals";

function elementChildren(node: Element): HTMLElement[] {
  return Array.from(node.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
}

function isGroupEntry(node: Element): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  if (node.matches(ROWS)) return true;
  const children = elementChildren(node);
  return node.matches(LAYOUTS) && children.length > 0 && children.every(isGroupEntry);
}

function markEntry(node: HTMLElement): void {
  if (node.matches(LAYOUTS)) {
    node.dataset.groupLayout = "";
    if (node.matches(GRIDS)) node.dataset.groupGrid = "";
    for (const child of elementChildren(node)) markEntry(child);
  } else {
    node.dataset.groupRow = "";
  }
}

function frame(items: readonly HTMLElement[], title?: string): HTMLElement {
  const group = el("div", "panel-group");
  if (title) {
    group.dataset.section = title;
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", title);
  }
  for (const item of items) {
    markEntry(item);
    group.appendChild(item);
  }
  return group;
}

/**
 * Called synchronously at the end of a screen render, including subsequent renders.
 * Moves existing nodes so inputs, event listeners, IDs and expanded panels survive.
 * Catalogues of independent art/choice tiles are not information-row lists.
 */
export function groupSections(root: HTMLElement): void {
  for (const heading of Array.from(root.querySelectorAll<HTMLElement>(HEADINGS))) {
    if (heading.closest(".panel-group")) continue;
    const items: HTMLElement[] = [];
    let next = heading.nextElementSibling;
    while (next && isGroupEntry(next)) {
      items.push(next);
      next = next.nextElementSibling;
    }
    if (!items.length) continue;
    const group = frame(items, heading.textContent?.trim());
    heading.after(group);
  }

  // Lists with their own screen title retain their existing scrolling container.
  for (const list of Array.from(root.querySelectorAll<HTMLElement>(LISTS))) {
    if (list.closest(".panel-group")) continue;
    const items = elementChildren(list);
    if (items.length < 2 || !items.every(isGroupEntry)) continue;
    list.appendChild(frame(items));
  }
}
