/** Anchored loadout layers remain attached while the player scrolls. */
import { mountPopupScroll } from "./popup-scroll";

export function traitPopupHost(owner: HTMLElement): HTMLElement {
  return owner.closest<HTMLElement>("#app") ?? owner.closest<HTMLElement>(".screen") ?? owner;
}

export function dismissTraitPopups(host: HTMLElement, all = false): boolean {
  let dismissed = false;
  do {
    const top = host.querySelector<HTMLElement>(".trait-detail-layer")
      ?? host.querySelector<HTMLElement>(".trait-picker");
    if (!top) break;
    top.dispatchEvent(new Event("dismiss-trait-popup"));
    dismissed = true;
    if (host.contains(top)) break;
  } while (all);
  return dismissed;
}

export function mountTraitPicker(
  owner: HTMLElement, row: HTMLElement, selected: number, panel: HTMLElement, onClose: () => void,
  anchor?: HTMLElement,
): () => void {
  const host = traitPopupHost(owner);
  // Only one loadout is edited at a time.
  dismissTraitPopups(host, true);
  host.appendChild(panel);
  const pointer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  pointer.classList.add("trait-picker-pointer");
  pointer.setAttribute("viewBox", "0 0 24 16");
  pointer.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M1 15L12 2L23 15");
  pointer.appendChild(path);
  panel.prepend(pointer);

  const place = (): void => {
    const bounds = row.getBoundingClientRect(), viewport = host.getBoundingClientRect();
    const target = (anchor ?? row.querySelector<HTMLElement>(`[data-slot="${selected}"]`))?.getBoundingClientRect();
    if (!target) return;
    const width = Math.min(bounds.width, Math.max(0, viewport.width - 32));
    const left = Math.max(16, Math.min(bounds.left - viewport.left, viewport.width - width - 16));
    const edge = anchor ? target : bounds;
    panel.classList.remove("above");
    panel.style.width = `${width}px`;
    panel.style.left = `${left}px`;
    panel.style.maxHeight = `${Math.max(100,Math.min(360,viewport.height - 32))}px`;
    panel.style.top = `${edge.bottom - viewport.top + 14}px`;
    panel.style.bottom = "auto";
    panel.style.setProperty("--trait-arrow", `${Math.max(16, Math.min(width - 16, target.left + target.width / 2 - viewport.left - left))}px`);
  };
  const outside = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node) || panel.contains(target) || (anchor ?? row).contains(target)
        || host.querySelector(".trait-detail-layer")?.contains(target)) return;
    onClose();
  };
  const key = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault(); event.stopPropagation();
    dismissTraitPopups(host);
  };
  const page = owner.closest<HTMLElement>(".screen");
  const observer = new MutationObserver(() => {
    if (!owner.isConnected || page?.classList.contains("hidden") || owner.closest(".deck.hidden")) onClose();
  });
  host.addEventListener("click", outside, true);
  host.addEventListener("keydown", key, true);
  observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:["class"]});
  const releaseScroll = mountPopupScroll(owner,panel,place);
  return () => {
    observer.disconnect();
    host.removeEventListener("click", outside, true);
    host.removeEventListener("keydown", key, true);
    releaseScroll();
    panel.remove();
  };
}
