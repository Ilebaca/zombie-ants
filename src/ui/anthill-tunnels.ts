/** Dark, gently curved tunnels behind the unchanged chamber layout. */
export function mountAnthillTunnels(
  owner: HTMLElement, progress: HTMLElement, nest: HTMLElement,
): () => void {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.classList.add("hill-tunnels");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("preserveAspectRatio", "none");
  nest.prepend(svg);
  let live = true;
  let resize: ResizeObserver | undefined;
  let removal: MutationObserver | undefined;

  const draw = (): void => {
    if (!live) return;
    const bounds = nest.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const rooms = Array.from(nest.querySelectorAll<HTMLElement>(".nest-lvl > .room"));
    const start = progress.getBoundingClientRect().bottom - bounds.top;
    const points = rooms.map((room, i) => {
      const r = room.getBoundingClientRect();
      return { x: bounds.width / 2 + ([4, -5, 6, -4, 5, 0][i % 6] ?? 0),
        y: r.top + r.height / 2 - bounds.top,
        edge: room.closest(".left") ? r.right - bounds.left - 12 : r.left - bounds.left + 12 };
    });
    const top = Math.min(0, start);
    const height = Math.max(1, bounds.height - top);
    svg.style.top = `${top}px`;
    svg.style.height = `${height}px`;
    svg.setAttribute("viewBox", `0 ${top} ${bounds.width} ${height}`);
    let trunk = `M ${bounds.width / 2} ${start}`;
    let x = bounds.width / 2, y = start;
    for (const point of points) {
      const bend = (point.y - y) * .48;
      trunk += ` C ${x} ${y + bend}, ${point.x} ${point.y - bend}, ${point.x} ${point.y}`;
      x = point.x; y = point.y;
    }
    const path = (d: string): SVGPathElement => {
      const line = document.createElementNS(ns, "path");
      line.setAttribute("d", d);
      return line;
    };
    svg.replaceChildren(path(trunk), ...points.map(p =>
      path(`M ${p.x} ${p.y - 22} C ${p.x} ${p.y + 1}, ${p.edge} ${p.y + 11}, ${p.edge} ${p.y}`)));
  };

  const stop = (): void => {
    live = false;
    resize?.disconnect();
    removal?.disconnect();
    window.removeEventListener("resize", draw);
    svg.remove();
  };
  // Screens are assembled before being attached. Start observers once the page is mounted.
  queueMicrotask(() => {
    if (!live || !owner.isConnected) return;
    draw();
    if (typeof ResizeObserver !== "undefined") {
      resize = new ResizeObserver(draw);
      resize.observe(nest);
      resize.observe(progress);
    }
    removal = new MutationObserver(() => { if (!owner.isConnected) stop(); });
    removal.observe(document.body, {childList:true, subtree:true});
    window.addEventListener("resize", draw);
    void document.fonts?.ready.then(draw);
  });
  return stop;
}
