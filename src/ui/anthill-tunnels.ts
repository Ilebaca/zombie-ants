/** Broad, flowing tunnels with smoothly joined forks behind the chamber cards. */
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
    const center = bounds.width / 2;
    const sweep = Math.min(34, bounds.width * .095);
    const points = rooms.map(room => {
      const r = room.getBoundingClientRect();
      const left = !!room.closest(".left");
      return {
        x: center + (left ? sweep : -sweep),
        y: r.top + r.height / 2 - bounds.top,
        edge: left ? r.right - bounds.left - 16 : r.left - bounds.left + 16,
        direction: left ? -1 : 1,
      };
    });
    const top = Math.min(0, start);
    const height = Math.max(1, bounds.height - top);
    svg.style.top = `${top}px`;
    svg.style.height = `${height}px`;
    svg.setAttribute("viewBox", `0 ${top} ${bounds.width} ${height}`);
    const path = (d: string, kind: string): SVGPathElement => {
      const line = document.createElementNS(ns, "path");
      line.classList.add(kind);
      line.setAttribute("d", d);
      return line;
    };
    let trunk = `M ${center} ${start}`;
    let x = center, y = start;
    const branches: SVGPathElement[] = [];
    points.forEach((point, i) => {
      const span = point.y - y;
      if (i === points.length - 1) {
        // Finish inside the final chamber instead of leaving an unused stump.
        trunk += ` C ${x} ${y + span * .55}, ${point.edge - point.direction * 32} ${point.y}, ${point.edge} ${point.y}`;
        return;
      }
      const c1 = { x, y: y + span * .46 };
      const c2 = { x: point.x, y: point.y - span * .46 };
      trunk += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${point.x} ${point.y}`;
      // Forks share the trunk's position and tangent for a smooth, continuous join.
      const t = .62, u = 1 - t;
      const forkX = u ** 3 * x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * point.x;
      const forkY = u ** 3 * y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * point.y;
      const dx = 3 * u ** 2 * (c1.x - x) + 6 * u * t * (c2.x - c1.x) + 3 * t ** 2 * (point.x - c2.x);
      const dy = 3 * u ** 2 * (c1.y - y) + 6 * u * t * (c2.y - c1.y) + 3 * t ** 2 * (point.y - c2.y);
      const length = Math.max(1, Math.hypot(dx, dy));
      const lead = Math.min(28, span * .4);
      branches.push(path(
        `M ${forkX} ${forkY} C ${forkX + dx / length * lead} ${forkY + dy / length * lead}, ${point.edge - point.direction * 28} ${point.y}, ${point.edge} ${point.y}`,
        "hill-tunnel-branch",
      ));
      x = point.x; y = point.y;
    });
    svg.replaceChildren(path(trunk, "hill-tunnel-main"), ...branches);
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
