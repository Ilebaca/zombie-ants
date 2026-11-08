/** Keep an installed game's layout unchanged when Android reveals transient bars. */
export function stabilizeInstalledViewport(): void {
  if (!window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches) return;
  const root = document.documentElement;
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;height:100lvh";
  document.body.appendChild(probe);
  let width = 0;
  const measure = (): void => {
    // Same-width resizes include system bars and the keyboard; neither is a new layout.
    if (width === window.innerWidth) return;
    width = window.innerWidth;
    const height = probe.getBoundingClientRect().height || window.innerHeight;
    root.style.setProperty("--installed-height", `${height}px`);
  };
  measure();
  root.classList.add("installed-frame");
  window.addEventListener("resize", measure);
}
