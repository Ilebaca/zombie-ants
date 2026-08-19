/**
 * The board painter.
 *
 * Reads GameState and never writes to it. Everything time-varying (reveal progress,
 * pulses, drifting motes) either lives in the renderer's own state or is derived from
 * the clock, so drawing a frame can never change the game.
 */
import { isConnected } from "../engine";
import type { Coord, GameState, Player, Tile } from "../engine";
import type { Layout } from "./layout";
import type { RevealTracker, RevealEdge } from "./reveal";
import type { Look } from "./art";
import { nestArt } from "./art";
import { COL, MAP, hexA, ownerCol } from "./palette";
import { capturedCorners, rrect, rrectC } from "./shapes";

const TAU = 6.283;

export interface Scene {
  ctx: CanvasRenderingContext2D;
  layout: Layout;
  state: GameState;
  reveal: RevealTracker;
  /** Which skin each side is wearing. */
  looks: Record<Player, Look>;
  /** The win-flood finale hides every soldier count. */
  hideCounts: boolean;
  /** Currently selected source tile, if any. */
  selection: Coord | null;
  /** Legal targets for the current selection/mode. */
  valid: readonly Coord[];
  /** Whose turn it is — drives the target highlight colour. */
  current: Player;
}

export interface Mote { x: number; y: number; s: number; sp: number; ph: number }

export function seedMotes(reduced: boolean): Mote[] {
  const n = reduced ? 0 : 34;
  const out: Mote[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: Math.random(), y: Math.random(),
      s: 0.4 + Math.random() * 1.4,
      sp: 0.02 + Math.random() * 0.05,
      ph: Math.random() * TAU,
    });
  }
  return out;
}

/** Sunlit field, vignette, the playing grid, and drifting pollen. */
export function drawBackground(
  ctx: CanvasRenderingContext2D, layout: Layout, motes: Mote[], startedAt: number,
): void {
  const w = layout.width, h = layout.height, n = layout.size;

  const field = ctx.createRadialGradient(w / 2, h * 0.40, 30, w / 2, h * 0.5, Math.max(w, h) * 0.80);
  field.addColorStop(0, MAP.fieldCenter);
  field.addColorStop(1, MAP.fieldEdge);
  ctx.fillStyle = field; ctx.fillRect(0, 0, w, h);

  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.30, w / 2, h / 2, Math.max(w, h) * 0.72);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, MAP.vignette);
  ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);

  // straight-line grid — no rounded cells, no gaps: it shows the playing field, not the tiles
  ctx.strokeStyle = MAP.grid; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c <= n; c++) {
    const gx = Math.round(layout.x0(c)) + 0.5;
    ctx.moveTo(gx, layout.oy); ctx.lineTo(gx, layout.oy + n * layout.ts);
  }
  for (let r = 0; r <= n; r++) {
    const gy = Math.round(layout.y0(r)) + 0.5;
    ctx.moveTo(layout.ox, gy); ctx.lineTo(layout.ox + n * layout.ts, gy);
  }
  ctx.stroke();

  const t = (performance.now() - startedAt) / 1000;
  for (const p of motes) {
    p.y -= p.sp * 0.012;
    if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
    const x = (p.x + Math.sin(t * 0.6 + p.ph) * 0.01) * w, y = p.y * h;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = MAP.motes;
    ctx.beginPath(); ctx.arc(x, y, p.s, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** Clip to the revealed portion of a cell — a directional "progress bar" wipe. */
interface BadgeOptions {
  text: string;
  /** Centre of the badge. */
  cx: number;
  cy: number;
  stroke: string;
  ink: string;
  /** Shrinks the whole badge; the wild-garrison one sits slightly smaller. */
  scale?: number;
}

/**
 * The troop count.
 *
 * A single digit draws as a CIRCLE, and the badge only grows sideways once the number needs
 * the room — the corner radius stays at half the height, so 7, 42 and 128 read as the same
 * shape stretched, not as three different badges. Sizes are in tile units so it holds up on
 * a 7×7 board and a 13×13 one alike.
 */
function countBadge(scene: Scene, o: BadgeOptions): void {
  const { ctx, layout } = scene;
  const ts = layout.ts;
  const scale = o.scale ?? 1;
  const ph = ts * 0.42 * scale;

  ctx.font = `900 ${Math.max(13, ts * 0.34 * scale)}px var(--font),sans-serif`;
  const pw = Math.max(ph, ctx.measureText(o.text).width + ts * 0.24 * scale);
  const px = o.cx - pw / 2;
  const py = o.cy - ph / 2;

  ctx.fillStyle = "rgba(8,12,20,0.82)";
  rrect(ctx, px, py, pw, ph, ph / 2); ctx.fill();
  ctx.lineWidth = Math.max(1.2, ts * 0.022);
  ctx.strokeStyle = o.stroke;
  rrect(ctx, px, py, pw, ph, ph / 2); ctx.stroke();

  ctx.fillStyle = o.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(o.text, o.cx, o.cy + 1);
}

function clipReveal(ctx: CanvasRenderingContext2D, layout: Layout, t: Tile, rv: number, edge: RevealEdge): void {
  const x = layout.x0(t.c), y = layout.y0(t.r), s = layout.ts;
  let cx0 = x, cy0 = y, cw = s, ch = s;
  if (edge === "L") { cw = s * rv; }
  else if (edge === "R") { cx0 = x + s * (1 - rv); cw = s * rv; }
  else if (edge === "U") { ch = s * rv; }
  else { cy0 = y + s * (1 - rv); ch = s * rv; }
  ctx.beginPath(); ctx.rect(cx0, cy0, cw, ch); ctx.clip();
}

export function drawTile(scene: Scene, t: Tile): void {
  const { ctx, layout, state, reveal } = scene;
  const ts = layout.ts;
  const pad = Math.max(1, ts * 0.05);              // gap scales with tile size
  const x = layout.x0(t.c) + pad, y = layout.y0(t.r) + pad;
  const w = ts - pad * 2, h = ts - pad * 2;
  const r = Math.max(3, ts * 0.18);

  if (t.terrain === "blocked") {
    ctx.fillStyle = MAP.rock;
    rrect(ctx, x + w * 0.12, y + h * 0.12, w * 0.76, h * 0.76, r * 0.7); ctx.fill();
    ctx.fillStyle = MAP.rockTop;
    ctx.beginPath(); ctx.arc(layout.cx(t.c), layout.cy(t.r), w * 0.16, 0, TAU); ctx.fill();
    return;
  }

  const hive = t.terrain === "hiveQ" || t.terrain === "hiveG";
  const isVein = t.struct === "vein";
  const detached = !!t.owner && !isConnected(state, t);        // cut off from the nest
  const rvState = t.owner ? reveal.get(t.c, t.r) : undefined;
  const rev = rvState ? rvState.rv : 1;

  if (t.owner) {
    // backdrop while filling: the previous holder fades out under the incoming colour
    if (rvState && rev < 1 && rvState.prev) {
      ctx.fillStyle = hexA(ownerCol(rvState.prev), 0.12);
      rrect(ctx, x, y, w, h, r); ctx.fill();
    }
    ctx.save();
    if (rvState && rev < 1) clipReveal(ctx, layout, t, rev, rvState.edge);

    const X0 = layout.x0(t.c), Y0 = layout.y0(t.r);            // full cell — edge to edge, no gap
    ctx.fillStyle = detached
      ? (isVein ? "rgba(150,165,190,0.75)" : "rgb(56,68,88)")
      : ownerCol(t.owner);

    if (isVein) {
      // A trail, not territory: a half-bar toward each linked neighbour, so it renders as a
      // straight line, an L-corner, a T-branch or a cross depending on what it connects.
      const owner = t.owner;
      const thick = ts * 0.20, half = thick / 2;
      const px = layout.cx(t.c), py = layout.cy(t.r);
      const linked = (c: number, rr: number): boolean => {
        const nb = state.grid[rr]?.[c];
        return !!(nb && nb.owner === owner && (nb.struct === "vein" || nb.struct === "stable" || nb.struct === "nest"));
      };
      const L = linked(t.c - 1, t.r), R = linked(t.c + 1, t.r);
      const U = linked(t.c, t.r - 1), D = linked(t.c, t.r + 1);

      ctx.fillRect(px - half, py - half, thick, thick);        // hub, so arms join with sharp corners
      if (L) ctx.fillRect(X0, py - half, px - X0, thick);
      if (R) ctx.fillRect(px, py - half, X0 + ts - px, thick);
      if (U) ctx.fillRect(px - half, Y0, thick, py - Y0);
      if (D) ctx.fillRect(px - half, py, thick, Y0 + ts - py);
      if (!L && !R && !U && !D) {                              // lone vein mid-animation
        const edge = rvState?.edge;
        const horiz = edge === "L" || edge === "R" || !edge;
        if (horiz) ctx.fillRect(X0, py - half, ts, thick);
        else ctx.fillRect(px - half, Y0, thick, ts);
      }
    } else {
      // Captured territory fills the whole cell; only OUTER corners round, so neighbours fuse.
      const r0 = Math.max(3, ts * 0.20);
      const [tl, tr, br, bl] = capturedCorners(state, t, r0);
      rrectC(ctx, X0, Y0, ts, ts, tl, tr, br, bl); ctx.fill();
    }
    ctx.restore();

  } else if (t.terrain === "resource") {
    // a subtle square tint (no rounding) so the diamond has a home
    ctx.fillStyle = MAP.resCell;
    ctx.fillRect(layout.x0(t.c), layout.y0(t.r), ts, ts);
  }

  if (t.terrain === "resource") {
    ctx.save();
    ctx.shadowColor = COL["gold-glow"] ?? "#ffe48a"; ctx.shadowBlur = ts * 0.3;
    ctx.fillStyle = COL.gold ?? "#ffd23f";
    const gx = layout.cx(t.c), gy = layout.cy(t.r) - (t.owner ? h * 0.16 : 0), s = w * 0.16;
    ctx.beginPath();
    ctx.moveTo(gx, gy - s); ctx.lineTo(gx + s, gy); ctx.lineTo(gx, gy + s); ctx.lineTo(gx - s, gy);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  if (hive) drawHiveTile(scene, t);

  // wild neutral garrison — a defended tile you must fight through
  if (!t.owner && t.guard > 0) {
    countBadge(scene, {
      text: "🛡" + t.guard,
      cx: layout.cx(t.c),
      cy: layout.cy(t.r),
      stroke: "rgba(190,205,225,0.7)",
      ink: "#eef3fb",
      scale: 0.9,
    });
  }

  if (t.owner && (t.struct === "stable" || t.struct === "nest")) {
    ctx.save();
    ctx.globalAlpha = rev;
    if (t.tunnel) {                                            // gallery mouth: dark shaft, lit rim
      const gx = layout.cx(t.c), gy = layout.cy(t.r) - h * 0.30, gr = w * 0.15;
      ctx.fillStyle = "rgba(4,8,14,0.92)";
      ctx.beginPath(); ctx.ellipse(gx, gy, gr, gr * 0.74, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = ownerCol(t.owner, "glow"); ctx.lineWidth = Math.max(1.5, w * 0.035);
      ctx.beginPath(); ctx.ellipse(gx, gy, gr, gr * 0.74, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = hexA(ownerCol(t.owner, "glow"), 0.55);
      ctx.beginPath(); ctx.ellipse(gx, gy + gr * 0.30, gr * 0.46, gr * 0.26, 0, 0, TAU); ctx.fill();
    }
    if (t.struct === "nest") {                                 // only the base carries an illustration
      const look = scene.looks[t.owner];
      nestArt(
        ctx, layout.cx(t.c), layout.cy(t.r) - h * 0.14, w * 0.44,
        look.hill, detached ? "rgba(150,165,190,0.7)" : ownerCol(t.owner, "glow"),
      );
    }
    ctx.restore();
  }

  // Detachment needs no badge — the grey fill and muted count already read as "cut off".

  drawTileEffects(scene, t);

  if (t.owner && t.soldiers > 0 && !scene.hideCounts) {
    ctx.save();
    ctx.globalAlpha = rev;
    countBadge(scene, {
      text: String(t.soldiers),
      cx: layout.cx(t.c),
      cy: t.struct === "nest" ? layout.cy(t.r) + h * 0.14 + ts * 0.21 : layout.cy(t.r),
      stroke: detached ? "rgba(150,165,190,0.7)" : ownerCol(t.owner, "glow"),
      ink: detached ? "#c7d0de" : "#fff",
    });
    ctx.restore();
  }

  // Ghost cloak: YOUR hidden tiles render at ~50%. The enemy sees nothing — the AI skips them.
  if (t.hidden && t.owner === "you") {
    ctx.save();
    ctx.globalAlpha = 0.5; ctx.fillStyle = MAP.fieldCenter;
    rrect(ctx, x, y, w, h, r); ctx.fill();
    ctx.globalAlpha = 0.35 + 0.12 * Math.sin(performance.now() / 300 + t.c + t.r);
    ctx.strokeStyle = "#cfe0ff"; ctx.lineWidth = Math.max(1, ts * 0.04);
    ctx.setLineDash([ts * 0.14, ts * 0.10]);
    rrect(ctx, x + w * 0.06, y + h * 0.06, w * 0.88, h * 0.88, r); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

export function drawTileEffects(scene: Scene, t: Tile): void {
  const { ctx, layout, state } = scene;
  const ts = layout.ts;
  const x = layout.x0(t.c), y = layout.y0(t.r), s = ts, now = performance.now();

  for (const e of state.effects) {
    if (e.c !== t.c || e.r !== t.r) continue;

    if (e.kind === "armor") {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = hexA(ownerCol(e.owner, "glow"), 0.8);
      ctx.lineWidth = Math.max(1.5, ts * 0.05);
      ctx.setLineDash([ts * 0.12, ts * 0.10]);
      rrect(ctx, x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8, 8); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      continue;
    }

    let rgb: string, alpha: number;
    if (e.kind === "fire") { rgb = "200,60,20"; alpha = 0.55; }
    else if (e.kind === "venom") { rgb = "120,40,190"; alpha = 0.50; }
    else if (e.kind === "leaf") { rgb = "70,150,55"; alpha = 0.62; }
    else continue;

    ctx.save();
    ctx.fillStyle = `rgba(${rgb},${alpha})`;
    rrect(ctx, x + 1, y + 1, s - 2, s - 2, 8); ctx.fill();

    if (e.kind === "fire") {
      for (let i = 0; i < 4; i++) {
        const ph = (now / 300 + i * 0.27) % 1;
        const fx = x + s * (0.22 + 0.18 * i), fy = y + s * 0.82 - ph * s * 0.62;
        const fr = s * 0.13 * (1 - ph * 0.5);
        ctx.fillStyle = `rgba(255,${Math.round(150 + 90 * (1 - ph))},40,${0.85 * (1 - ph)})`;
        ctx.beginPath();
        ctx.moveTo(fx, fy + fr);
        ctx.quadraticCurveTo(fx - fr, fy, fx, fy - fr * 1.6);
        ctx.quadraticCurveTo(fx + fr, fy, fx, fy + fr);
        ctx.fill();
      }
    }
    if (e.kind === "venom") {
      ctx.fillStyle = "rgba(190,120,255,0.9)";
      for (let i = 0; i < 3; i++) {
        const dy = (now / 260 + i * 0.4) % 1;
        ctx.beginPath();
        ctx.arc(x + s * (0.3 + 0.2 * i), y + s * 0.2 + dy * s * 0.6, s * 0.05, 0, TAU);
        ctx.fill();
      }
    }
    if (e.kind === "leaf") {
      ctx.strokeStyle = "rgba(30,80,25,0.8)"; ctx.lineWidth = Math.max(1, ts * 0.035);
      ctx.beginPath(); ctx.moveTo(x + s * 0.5, y + s * 0.22); ctx.lineTo(x + s * 0.5, y + s * 0.78); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + s * 0.5, y + s * 0.4); ctx.lineTo(x + s * 0.3, y + s * 0.3);
      ctx.moveTo(x + s * 0.5, y + s * 0.4); ctx.lineTo(x + s * 0.7, y + s * 0.3);
      ctx.moveTo(x + s * 0.5, y + s * 0.6); ctx.lineTo(x + s * 0.32, y + s * 0.52);
      ctx.moveTo(x + s * 0.5, y + s * 0.6); ctx.lineTo(x + s * 0.68, y + s * 0.52);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawHiveTile(scene: Scene, t: Tile): void {
  const { ctx, layout, state } = scene;
  const ts = layout.ts;
  const x = layout.cx(t.c), y = layout.cy(t.r), R = ts * 0.30;
  const awake = state.hive.phase !== "dormant";
  const col = awake ? (COL.hive ?? "#b14de0") : (COL["hive-dim"] ?? "#4b3a6e");
  const glow = awake ? (COL["hive-glow"] ?? "#dd9bff") : "rgba(120,90,170,0.4)";
  const pulse = awake ? (0.6 + 0.4 * Math.sin(performance.now() / 300)) : 0.3;

  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = ts * (awake ? 0.6 : 0.25) * pulse;
  if (t.terrain === "hiveQ") {                       // spore stalks erupting from the queen
    ctx.strokeStyle = glow; ctx.lineWidth = Math.max(1.5, ts * 0.04); ctx.lineCap = "round";
    for (let i = 0; i < 5; i++) {
      const a = -1.57 + (i - 2) * 0.5;
      const ex = x + Math.cos(a) * R * 1.7, ey = y + Math.sin(a) * R * 1.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * R, y + Math.sin(a) * R - R * 0.6, ex, ey);
      ctx.stroke();
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(ex, ey, ts * 0.05, 0, TAU); ctx.fill();
    }
  }
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x, y, R * (t.terrain === "hiveQ" ? 1 : 0.78), 0, TAU); ctx.fill();
  ctx.restore();

  ctx.fillStyle = hexA(glow, awake ? 0.9 : 0.4);
  ctx.beginPath(); ctx.arc(x, y, R * 0.34, 0, TAU); ctx.fill();

  if (t.owner === null) {
    ctx.font = `900 ${Math.max(10, ts * 0.22)}px var(--font),sans-serif`;
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🛡" + t.soldiers, x, y + R * 1.25);
  }
}

/** The white selection ring plus the pulsing dashed rings on every legal target. */
export function drawSelection(scene: Scene): void {
  const { ctx, layout, selection, valid } = scene;
  const ts = layout.ts;

  if (selection) {
    const x = layout.x0(selection.c) + 2, y = layout.y0(selection.r) + 2;
    const w = ts - 4, h = ts - 4, r = Math.max(6, ts * 0.18);
    ctx.save();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.shadowColor = "#fff"; ctx.shadowBlur = 10;
    rrect(ctx, x, y, w, h, r); ctx.stroke();
    ctx.restore();
  }

  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
  const col = ownerCol(scene.current, "glow");
  for (const v of valid) {
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.4 * pulse;
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.setLineDash([ts * 0.12, ts * 0.10]);
    ctx.beginPath(); ctx.arc(layout.cx(v.c), layout.cy(v.r), ts * 0.34, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}
