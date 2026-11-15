/** Chamber details stay below their room button while the player scrolls. */
import { mountPopupScroll } from "./popup-scroll";
export function dismissAnthillPopup(host: HTMLElement): boolean {
  const panel = host.querySelector<HTMLElement>(".hill-popup");
  if (!panel) return false;
  panel.dispatchEvent(new Event("dismiss-anthill-popup"));
  return true;
}

export function mountAnthillPopup(
  owner: HTMLElement, anchor: HTMLElement, panel: HTMLElement,
  onClose: () => void,
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
    const top = target.bottom - viewport.top + 12;
    panel.style.width = `${width}px`;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.maxHeight = "none";
    panel.style.setProperty("--hill-arrow", `${Math.max(18, Math.min(width - 18, target.left + target.width / 2 - viewport.left - left))}px`);
  };

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
  const observer = new MutationObserver(() => {
    if (!owner.isConnected || !anchor.isConnected || owner.classList.contains("hidden")
        || owner.closest(".deck.hidden")) onClose();
  });
  observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:["class"]});
  host.addEventListener("click", outside, true);
  document.addEventListener("keydown", key, true);
  const releaseScroll = mountPopupScroll(owner,panel,place);
  return () => {
    observer.disconnect();
    host.removeEventListener("click", outside, true);
    document.removeEventListener("keydown", key, true);
    releaseScroll();
    panel.remove();
  };
}
