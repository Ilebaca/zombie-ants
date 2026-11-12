/** A chamber's details float above the deck, anchored below its own room button. */
export function dismissAnthillPopup(host: HTMLElement): boolean {
  const panel = host.querySelector<HTMLElement>(".hill-popup");
  if (!panel) return false;
  panel.dispatchEvent(new Event("dismiss-anthill-popup"));
  return true;
}

export function mountAnthillPopup(
  owner: HTMLElement, anchor: HTMLElement, panel: HTMLElement,
  onClose: () => void, makeSpace: boolean,
): () => void {
  const host = owner.closest<HTMLElement>("#app") ?? owner;
  dismissAnthillPopup(host);
  host.appendChild(panel);

  const pointer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  pointer.classList.add("hill-popup-pointer");
  pointer.setAttribute("viewBox", "0 0 24 16");
  pointer.setAttribute("aria-hidden", "true");
  const tip = document.createElementNS("http://www.w3.org/2000/svg", "path");
  tip.setAttribute("d", "M1 15L12 2L23 15");
  pointer.appendChild(tip);
  panel.prepend(pointer);

  const place = (): void => {
    const viewport = host.getBoundingClientRect(), target = anchor.getBoundingClientRect();
    if (viewport.width <= 0 || viewport.height <= 0) return;
    const column = owner.querySelector<HTMLElement>(".screenbody")?.getBoundingClientRect();
    const width = Math.min(column?.width ?? viewport.width - 32, viewport.width - 32);
    const left = Math.max(16, Math.min((column?.left ?? viewport.left + 16) - viewport.left, viewport.width - width - 16));
    const safeBottom = parseFloat(getComputedStyle(owner).getPropertyValue("--safe-bottom")) || 0;
    const top = target.bottom - viewport.top + 12;
    panel.style.width = `${width}px`;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.maxHeight = `${Math.max(80, viewport.height - top - safeBottom - 12)}px`;
    panel.style.setProperty("--hill-arrow", `${Math.max(18, Math.min(width - 18, target.left + target.width / 2 - viewport.left - left))}px`);
  };

  let live = true;
  place();
  queueMicrotask(() => {
    if (!live) return;
    if (makeSpace) {
      const viewport = host.getBoundingClientRect(), target = anchor.getBoundingClientRect();
      const safeBottom = parseFloat(getComputedStyle(owner).getPropertyValue("--safe-bottom")) || 0;
      // Scroll only when necessary; no rows, margins or document heights are changed.
      const room = viewport.bottom - target.bottom - safeBottom - 24;
      const content = panel.querySelector<HTMLElement>(".hill-popup-content");
      const header = panel.querySelector<HTMLElement>(".hill-popup-head");
      const needed = Math.min((content?.scrollHeight ?? panel.scrollHeight) + (header?.offsetHeight ?? 0), 320, viewport.height * .55);
      if (viewport.height > 0 && room < needed) owner.scrollTop += needed - room;
    }
    place();
  });

  const outside = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node) || panel.contains(target) || anchor.contains(target)) return;
    onClose();
  };
  const key = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };
  const scrolled = (): void => {
    const target = anchor.getBoundingClientRect(), viewport = host.getBoundingClientRect();
    if (target.bottom < viewport.top || target.top > viewport.bottom) { onClose(); return; }
    place();
  };
  const observer = new MutationObserver(() => {
    if (!owner.isConnected || !anchor.isConnected || owner.classList.contains("hidden")
        || owner.closest(".deck.hidden")) onClose();
  });
  observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:["class"]});
  host.addEventListener("click", outside, true);
  document.addEventListener("keydown", key, true);
  owner.addEventListener("scroll", scrolled);
  window.addEventListener("resize", place);
  window.visualViewport?.addEventListener("resize", place);
  return () => {
    live = false;
    observer.disconnect();
    host.removeEventListener("click", outside, true);
    document.removeEventListener("keydown", key, true);
    owner.removeEventListener("scroll", scrolled);
    window.removeEventListener("resize", place);
    window.visualViewport?.removeEventListener("resize", place);
    panel.remove();
  };
}
