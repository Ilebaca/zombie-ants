/** Anchored trait layers live above scrolling/clipped cards and the deck. */

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

  const frame = host.getBoundingClientRect();
  const needed = row.getBoundingClientRect().bottom + Math.min(300, frame.height * .4) + 30 - frame.bottom;
  if (needed > 0) {
    let scroller = owner.parentElement;
    while (scroller && scroller !== host) {
      if (scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY)) {
        scroller.scrollTop += needed;
        break;
      }
      scroller = scroller.parentElement;
    }
  }

  const place = (): void => {
    const bounds = row.getBoundingClientRect(), viewport = host.getBoundingClientRect();
    const target = row.querySelector<HTMLElement>(`[data-slot="${selected}"]`)?.getBoundingClientRect();
    if (!target) return;
    const width = Math.min(bounds.width, Math.max(0, viewport.width - 32));
    const left = Math.max(16, Math.min(bounds.left - viewport.left, viewport.width - width - 16));
    const below = viewport.bottom - bounds.bottom - 30;
    const above = bounds.top - viewport.top - 30;
    const flipped = below < 160 && above > below;
    panel.classList.toggle("above", flipped);
    panel.style.width = `${width}px`;
    panel.style.left = `${left}px`;
    panel.style.maxHeight = `${Math.max(100, Math.min(360, flipped ? above : below))}px`;
    panel.style.top = flipped ? "auto" : `${bounds.bottom - viewport.top + 14}px`;
    panel.style.bottom = flipped ? `${viewport.bottom - bounds.top + 14}px` : "auto";
    panel.style.setProperty("--trait-arrow", `${Math.max(16, Math.min(width - 16, target.left + target.width / 2 - viewport.left - left))}px`);
  };
  const outside = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node) || panel.contains(target) || row.contains(target)
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
  page?.addEventListener("scroll", place, true);
  window.addEventListener("resize", place);
  observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:["class"]});
  place();
  return () => {
    observer.disconnect();
    host.removeEventListener("click", outside, true);
    host.removeEventListener("keydown", key, true);
    page?.removeEventListener("scroll", place, true);
    window.removeEventListener("resize", place);
    panel.remove();
  };
}
