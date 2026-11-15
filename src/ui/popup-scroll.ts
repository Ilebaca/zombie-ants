/** Keep anchored popups reachable through user scrolling, without moving the page on open. */
interface ScrollSpace { spacer: HTMLElement; stop: () => void }
const spaces = new WeakMap<HTMLElement, ScrollSpace>();

export function mountPopupScroll(
  owner: HTMLElement, panel: HTMLElement, place: () => void,
): () => void {
  const page = owner.closest<HTMLElement>(".screen") ?? owner;
  const previous = spaces.get(page);
  previous?.stop();
  const spacer = previous?.spacer ?? document.createElement("div");
  spacer.className = "popup-scroll-space";
  spacer.setAttribute("aria-hidden","true");
  if (!previous) spacer.style.cssText = "flex:0 0 auto;width:100%;height:0;min-height:0;margin:0;padding:0;border:0;pointer-events:none";
  if (!spacer.isConnected) page.appendChild(spacer);
  let trim: (() => void) | null = null;
  const state: ScrollSpace = {spacer, stop: () => {
    if (trim) page.removeEventListener("scroll",trim);
    trim = null;
  }};
  spaces.set(page,state);
  let active = true;
  const naturalEnd = (): number => {
    const padding = parseFloat(getComputedStyle(page).paddingBottom) || 0;
    return spacer.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop + padding;
  };
  const update = (): void => {
    if (!active || spaces.get(page) !== state) return;
    place();
    const view = page.getBoundingClientRect();
    const safe = parseFloat(getComputedStyle(page).getPropertyValue("--safe-bottom")) || 0;
    const end = panel.getBoundingClientRect().bottom - view.top + page.scrollTop + safe + 16;
    const base = naturalEnd();
    const hold = page.scrollTop > 0 ? Math.max(0,page.scrollTop + page.clientHeight - base) : 0;
    const needed = Math.max(hold,end > page.clientHeight ? Math.max(0,end - base) : 0);
    spacer.style.height = Math.ceil(needed) + "px";
  };
  const canMove = (element: HTMLElement, delta: number): boolean =>
    delta > 0 ? element.scrollTop + element.clientHeight < element.scrollHeight - 1 : element.scrollTop > 0;
  const innerScroller = (target: EventTarget | null, delta: number): HTMLElement | null => {
    let element = target instanceof Element ? target : null;
    while (element && panel.contains(element)) {
      if (element instanceof HTMLElement && /auto|scroll/.test(getComputedStyle(element).overflowY)
          && canMove(element,delta)) return element;
      if (element === panel) break;
      element = element.parentElement;
    }
    return null;
  };
  const scrollTarget = (target: EventTarget | null, delta: number): HTMLElement | null => {
    const box = panel.getBoundingClientRect(), view = page.getBoundingClientRect();
    const safe = parseFloat(getComputedStyle(page).getPropertyValue("--safe-bottom")) || 0;
    // Bring the panel into view before scrolling a long list inside it.
    const hidden = delta > 0 ? box.bottom > view.bottom - safe - 16 : box.top < view.top + 16;
    if (hidden && canMove(page,delta)) return page;
    return innerScroller(target,delta) ?? (canMove(page,delta) ? page : null);
  };
  const wheel = (event: WheelEvent): void => {
    if (event.ctrlKey) return;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? page.clientHeight : 1);
    if (!delta) return;
    if (scrollTarget(event.target,delta) !== page) return;
    event.preventDefault();
    page.scrollTop += delta;
  };
  let touchY: number | null = null, captured = false;
  const touchStart = (event: TouchEvent): void => {
    const touch = event.touches.item(0);
    touchY = event.touches.length === 1 && touch ? touch.clientY : null;
    captured = false;
  };
  const touchMove = (event: TouchEvent): void => {
    if (touchY === null || event.touches.length !== 1) return;
    const touch = event.touches.item(0);
    if (!touch) return;
    const next = touch.clientY, delta = touchY - next;
    touchY = next;
    if (!delta) return;
    const target = scrollTarget(event.target,delta);
    if (target !== page && !captured) return; // Preserve native scrolling inside visible lists.
    if (event.cancelable) event.preventDefault();
    captured = true;
    if (target) target.scrollTop += delta;
  };
  const touchEnd = (): void => { touchY = null; captured = false; };
  panel.addEventListener("wheel",wheel,{passive:false});
  panel.addEventListener("touchstart",touchStart,{passive:true});
  panel.addEventListener("touchmove",touchMove,{passive:false});
  panel.addEventListener("touchend",touchEnd,{passive:true});
  panel.addEventListener("touchcancel",touchEnd,{passive:true});
  page.addEventListener("scroll",update);
  window.addEventListener("resize",update);
  window.visualViewport?.addEventListener("resize",update);
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
  resize?.observe(panel);
  update();
  queueMicrotask(update);

  return () => {
    if (!active) return;
    active = false;
    resize?.disconnect();
    page.removeEventListener("scroll",update);
    window.removeEventListener("resize",update);
    window.visualViewport?.removeEventListener("resize",update);
    panel.removeEventListener("wheel",wheel);
    panel.removeEventListener("touchstart",touchStart);
    panel.removeEventListener("touchmove",touchMove);
    panel.removeEventListener("touchend",touchEnd);
    panel.removeEventListener("touchcancel",touchEnd);
    if (spaces.get(page) !== state) return;
    // Closing a panel must not clamp the current scroll position. Retire its extra
    // space as the player scrolls back up, without shifting any existing content.
    trim = () => {
      if (spaces.get(page) !== state) return;
      const needed = page.scrollTop > 0 ? Math.max(0,page.scrollTop + page.clientHeight - naturalEnd()) : 0;
      spacer.style.height = Math.ceil(needed) + "px";
      if (needed < 1 || !page.isConnected || page.classList.contains("hidden")) {
        state.stop();
        spacer.remove();
        spaces.delete(page);
      }
    };
    page.addEventListener("scroll",trim);
    trim();
  };
}
